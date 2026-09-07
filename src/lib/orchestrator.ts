import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { getStore } from "./store";
import { Repo } from "./repo";
import { loadAgents, loadCommands, loadSkills, expandCommand, type AgentDef, type SkillInfo } from "./definitions";
import { buildMainSystem, buildSubagentSystem, TECHNICIAN_NOTE } from "./prompts";
import { STORAGE_TOOL_DEFS, executeStorageTool, isStorageTool, storageTools, toolNamesFromAllowlist, type ToolContext, type ToolResult } from "./tools";
import { runAgentLoop, type LoopEvent, type LoopStatus, type StreamClient } from "./runner";
import { loadThread, newThread, saveThread, summarize, type AskQuestion, type LogEvent, type Thread, type ThreadSummary } from "./threads";
import { fakeClient } from "./fake-client";

export interface RunInput {
  threadId?: string;
  command?: string;
  args?: string;
  message?: string;
  /** answers to a pending ask_analyst question: question text -> chosen labels (or the typed "other") */
  answers?: Record<string, string[]>;
  analyst?: string;
}

export type SSEEvent =
  | { type: "thread"; thread: ThreadSummary }
  | { type: "user"; text: string }
  | { type: "text"; agent: string; delta: string }
  | { type: "thinking"; agent: string; delta: string }
  | { type: "tool_call"; agent: string; id: string; name: string; input: unknown }
  | { type: "tool_result"; agent: string; id: string; name: string; content: string; isError: boolean }
  | { type: "server_tool"; agent: string; name: string; summary: string }
  | { type: "agent_start"; agent: string; task: string; resume: boolean }
  | { type: "agent_end"; agent: string; status: LoopStatus; text: string }
  | { type: "commit"; agent: string; path: string; commit: string; url?: string; message: string }
  | { type: "usage"; agent: string; input: number; output: number; cacheRead: number }
  | { type: "ask"; questions: AskQuestion[] }
  | { type: "done"; status: LoopStatus; awaiting: Thread["awaiting"]; threadId: string; qid?: string; text: string; questions?: AskQuestion[] }
  | { type: "error"; message: string };

/** Commands on which the analyst may have asked for code to run here. */
const CODE_EXEC_COMMANDS = new Set(["cb_dag", "cb_notebook", "cb_result"]);
/** Commands whose deliverable is a long file. */
const LONG_OUTPUT_COMMANDS = new Set(["cb_dag", "cb_notebook", "cb_report"]);

const MAX_TOKENS = { main: 16000, mainLong: 32000, writer: 8000, reader: 4000 };

function agentMaxTokens(a: AgentDef): number {
  return a.tools.some((t) => t === "Write" || t === "Edit") ? MAX_TOKENS.writer : MAX_TOKENS.reader;
}

function invokeSubagentTool(agents: AgentDef[]): Anthropic.Tool {
  return {
    name: "invoke_subagent",
    description:
      "Run a subagent (Claude Code's Task tool) to completion and get its final text back. It runs in its own context with only the task you give it and the repository; it never sees this conversation. Use resume: true to continue an agent's earlier conversation on this thread with its memory intact (needed for the interviewer across exchanges with the analyst).",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string", enum: agents.map((a) => a.name), description: "Which agent to run" },
        task: { type: "string", description: "The full brief: question id, paths, what to do, what to stress-test. For resume: true, the analyst's answer or 'continue'." },
        resume: { type: "boolean", description: "Continue this agent's previous conversation on this thread (default false = start fresh)" },
      },
      required: ["agent", "task"],
    },
  };
}

const ASK_TOOL: Anthropic.Tool = {
  name: "ask_analyst",
  description:
    "Ask the analyst one to four questions and wait for their answers (Claude Code's AskUserQuestion). Each question offers 2 to 4 concrete options; the analyst can always pick Other and type. Use it for every question you need answered: relaying the interviewer's questions, the every-third-exchange checkpoint (proceed / keep going / park it), deliverable and data-mode choices, confirmations. Never end your turn with a question in plain text. The tool result is their answer, and your turn continues from there.",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            question: { type: "string", description: "The full question, ending with a question mark" },
            header: { type: "string", description: "Very short label, max 12 chars, e.g. 'Data mode'" },
            options: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                properties: { label: { type: "string", description: "1-5 words" }, description: { type: "string", description: "What choosing this means" } },
                required: ["label"],
              },
            },
            multiSelect: { type: "boolean", description: "Allow several options at once (default false)" },
          },
          required: ["question", "options"],
        },
      },
    },
    required: ["questions"],
  },
};

function parseQuestions(input: unknown): AskQuestion[] {
  const qs = ((input ?? {}) as { questions?: unknown[] }).questions;
  if (!Array.isArray(qs)) return [];
  return qs
    .map((q) => q as Partial<AskQuestion>)
    .filter((q) => typeof q.question === "string" && q.question.trim())
    .slice(0, 4)
    .map((q) => ({
      question: q.question!.trim(),
      header: typeof q.header === "string" ? q.header.slice(0, 12) : undefined,
      options: (Array.isArray(q.options) ? q.options : [])
        .filter((o) => o && typeof (o as { label?: unknown }).label === "string")
        .slice(0, 4)
        .map((o) => ({ label: String((o as { label: string }).label), description: typeof (o as { description?: unknown }).description === "string" ? (o as { description: string }).description : undefined })),
      multiSelect: q.multiSelect === true,
    }));
}

function formatAnswers(questions: AskQuestion[], answers: Record<string, string[]> | undefined, freeText?: string): string {
  if (freeText) return `The analyst replied in their own words instead of picking an option:\n\n${freeText}`;
  const lines = questions.map((q, i) => {
    const a = answers?.[q.question] ?? answers?.[String(i)] ?? [];
    return `Q: ${q.question}\nA: ${a.length ? a.join("; ") : "(no answer)"}`;
  });
  return `The analyst answered:\n\n${lines.join("\n\n")}`;
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + `\n…[${s.length - n} more chars]` : s;
}

export async function runTurn(input: RunInput, emit: (e: SSEEvent) => void, clientOverride?: StreamClient): Promise<void> {
  const started = Date.now();
  const deadline = started + config.runBudgetMs;
  const client: StreamClient = clientOverride ?? (process.env.CB_FAKE_MODEL === "1" ? fakeClient() : (new Anthropic() as unknown as StreamClient));

  const store = getStore();
  const repo = new Repo(await store.load(), store);
  const commands = loadCommands(repo);
  const agents = loadAgents(repo);
  const skills = loadSkills(repo);

  let thread: Thread | undefined;
  if (input.threadId) {
    thread = loadThread(repo, input.threadId);
    if (!thread) {
      emit({ type: "error", message: `No thread ${input.threadId}` });
      return;
    }
  }

  // ---- the user turn
  let userText: string | undefined;
  let command = input.command?.trim();
  let answeredPending = false;
  if (thread?.pending && (input.answers || input.message?.trim()) && !command) {
    // resume the paused turn: the analyst's answer is the tool result the model is waiting for
    const p = thread.pending;
    const text = formatAnswers(p.questions, input.answers, input.answers ? undefined : input.message?.trim());
    thread.main.push({ role: "user", content: [...p.partialResults, { type: "tool_result", tool_use_id: p.toolUseId, content: text }] });
    thread.log.push({ t: new Date().toISOString(), kind: "user", agent: "analyst", text });
    thread.pending = undefined;
    answeredPending = true;
    emit({ type: "user", text });
  } else if (command) {
    const def = commands.find((c) => c.name === command);
    if (!def) {
      emit({ type: "error", message: `Unknown command /${command}. Available: ${commands.map((c) => c.name).join(", ")}` });
      return;
    }
    if (thread?.pending) {
      // a command arrived while a question was open: close the question so the history stays valid
      thread.main.push({ role: "user", content: [...thread.pending.partialResults, { type: "tool_result", tool_use_id: thread.pending.toolUseId, content: "The analyst did not answer and ran a command instead.", is_error: true }] });
      thread.pending = undefined;
    }
    const args = (input.args ?? "").trim();
    userText = `[/${def.name}${args ? ` ${JSON.stringify(args)}` : ""}]\n\n${expandCommand(def, args)}`;
    thread ??= newThread(`/${def.name} ${args}`.trim().slice(0, 120));
  } else if (input.message?.trim()) {
    userText = input.message.trim();
    thread ??= newThread(userText.slice(0, 120));
  } else {
    command = undefined;
    if (!thread) {
      emit({ type: "error", message: "Nothing to run: give a command or a message." });
      return;
    }
    if (thread.pending) {
      emit({ type: "error", message: "This thread is waiting for an answer to its question." });
      return;
    }
    const last = thread.main[thread.main.length - 1];
    if (!last || last.role !== "user") {
      emit({ type: "error", message: "Nothing to continue: the last turn finished. Send a message or a command." });
      return;
    }
  }

  const t = thread;
  const now = () => new Date().toISOString();
  const log = (e: Omit<LogEvent, "t">) => t.log.push({ t: now(), ...e });

  if (userText) {
    t.main.push({ role: "user", content: userText });
    log({ kind: "user", agent: "analyst", text: userText });
    emit({ type: "user", text: userText });
  }
  void answeredPending;
  emit({ type: "thread", thread: summarize(t) });

  const effectiveCommand = command ?? t.lastCommand;
  const codeExecution = !!effectiveCommand && CODE_EXEC_COMMANDS.has(effectiveCommand);
  const commitPrefix = `[${command ?? "reply"}${t.qid ? " " + t.qid : ""}]`;
  const readSet = (agent: string): Set<string> => {
    const s = new Set(t.reads[agent] ?? []);
    return s;
  };
  const persistReads = (agent: string, s: Set<string>) => {
    t.reads[agent] = [...s];
  };

  // ---- event plumbing shared by main and subagents
  const textBuf: Record<string, string> = {};
  const flushText = (agent: string) => {
    if (textBuf[agent]) {
      log({ kind: "text", agent, text: textBuf[agent] });
      textBuf[agent] = "";
    }
  };
  const forward = (agent: string) => (e: LoopEvent) => {
    switch (e.type) {
      case "text":
        textBuf[agent] = (textBuf[agent] ?? "") + e.delta;
        emit({ type: "text", agent, delta: e.delta });
        break;
      case "thinking":
        emit({ type: "thinking", agent, delta: e.delta });
        break;
      case "tool_call":
        flushText(agent);
        log({ kind: "tool", agent, name: e.name, input: e.input });
        emit({ type: "tool_call", agent, id: e.id, name: e.name, input: e.input });
        break;
      case "tool_result":
        if (e.isError) log({ kind: "tool", agent, name: e.name, ok: false, text: trunc(e.content, 500) });
        emit({ type: "tool_result", agent, id: e.id, name: e.name, content: trunc(e.content, 1500), isError: e.isError });
        break;
      case "server_tool":
        log({ kind: "server_tool", agent, name: e.name, text: e.summary });
        emit({ type: "server_tool", agent, name: e.name, summary: e.summary });
        break;
      case "usage":
        t.usage.input += e.input;
        t.usage.output += e.output;
        t.usage.cacheRead += e.cacheRead;
        emit({ type: "usage", agent, input: e.input, output: e.output, cacheRead: e.cacheRead });
        break;
    }
  };
  const onCommit = (agent: string) => (c: { path: string; commit: string; url?: string; message: string }) => {
    t.commits++;
    log({ kind: "commit", agent, path: c.path, commit: c.commit, url: c.url, text: c.message });
    emit({ type: "commit", agent, path: c.path, commit: c.commit, url: c.url, message: c.message });
  };

  // ---- subagents
  const runSubagent = async (name: string, task: string, resume: boolean): Promise<ToolResult> => {
    const def = agents.find((a) => a.name === name);
    if (!def) return { content: `Unknown agent "${name}". Available: ${agents.map((a) => a.name).join(", ")}`, isError: true };
    const toolNames = toolNamesFromAllowlist(def.tools);
    const canWrite = toolNames.includes("write_file") || toolNames.includes("edit_file");
    const extra = def.tools.includes("Bash") ? [TECHNICIAN_NOTE] : [];
    const system = buildSubagentSystem(repo, def, skills, extra);
    const existing = resume ? t.agents[name] : undefined;
    const messages = existing ? existing : [];
    const resumed = !!existing;
    messages.push({ role: "user", content: task });
    t.agents[name] = messages;
    const reads = readSet(name);
    const ctx: ToolContext = { repo, agent: name, canWrite, readSet: reads, commitPrefix, onCommit: onCommit(name) };

    flushText("main");
    log({ kind: "agent_start", agent: name, task, status: resumed ? "resumed" : "fresh" });
    emit({ type: "agent_start", agent: name, task, resume: resumed });

    const result = await runAgentLoop({
      client,
      model: config.model,
      system,
      tools: storageTools(toolNames),
      messages,
      maxTokens: agentMaxTokens(def),
      effort: config.effort,
      showThinking: config.showThinking,
      execute: (tool, inp) => (isStorageTool(tool) ? executeStorageTool(tool, inp, ctx) : Promise.resolve({ content: `Unknown tool ${tool}`, isError: true })),
      onEvent: forward(name),
      deadline,
      maxRounds: config.maxRounds,
    });
    persistReads(name, reads);
    flushText(name);
    log({ kind: "agent_end", agent: name, status: result.status, text: result.finalText });
    emit({ type: "agent_end", agent: name, status: result.status, text: result.finalText });

    const header =
      result.status === "paused"
        ? `[${name} ran out of the run's time budget before finishing. Call invoke_subagent again with resume: true and task "continue" to let it finish. Its output so far:]\n\n`
        : result.status === "max_rounds"
          ? `[${name} hit the tool-call limit. Call it again with resume: true if it needs to finish.]\n\n`
          : result.status === "refusal"
            ? `[${name} declined the task.]\n\n`
            : "";
    return { content: header + (result.finalText || "(the agent returned no text)") + (resumed ? "" : "") };
  };

  // ---- main agent
  const mainCtx: ToolContext = { repo, agent: "main", canWrite: true, readSet: readSet("main"), commitPrefix, onCommit: onCommit("main") };
  const tools: Anthropic.Messages.ToolUnion[] = [...Object.values(STORAGE_TOOL_DEFS), invokeSubagentTool(agents), ASK_TOOL];
  if (codeExecution) tools.push({ type: "code_execution_20260120", name: "code_execution" });
  const system = buildMainSystem(repo, { skills, agents, qid: t.qid, commandNames: commands.map((c) => c.name), codeExecution, analyst: input.analyst });

  let status: LoopStatus = "done";
  let finalText = "";
  let pendingQuestions: AskQuestion[] | undefined;
  try {
    const result = await runAgentLoop({
      client,
      model: config.model,
      system,
      tools,
      messages: t.main,
      maxTokens: effectiveCommand && LONG_OUTPUT_COMMANDS.has(effectiveCommand) ? MAX_TOKENS.mainLong : MAX_TOKENS.main,
      effort: config.effort,
      showThinking: config.showThinking,
      execute: async (name, inp) => {
        if (name === "ask_analyst") {
          const questions = parseQuestions(inp);
          if (!questions.length) return { content: "ask_analyst needs at least one question with options.", isError: true };
          return { content: "", pause: questions };
        }
        if (name === "invoke_subagent") {
          const i = (inp ?? {}) as { agent?: string; task?: string; resume?: boolean };
          return runSubagent(String(i.agent ?? ""), String(i.task ?? ""), i.resume === true);
        }
        return executeStorageTool(name, inp, mainCtx);
      },
      onEvent: forward("main"),
      deadline,
      maxRounds: config.maxRounds,
    });
    status = result.status;
    finalText = result.finalText;
    if (result.status === "awaiting_input" && result.pending) {
      pendingQuestions = result.pending.payload as AskQuestion[];
      t.pending = { ...result.pending, questions: pendingQuestions };
      log({ kind: "ask", agent: "main", questions: pendingQuestions });
      emit({ type: "ask", questions: pendingQuestions });
    }
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Anthropic API error ${e.status}: ${e.message}` : (e as Error).message;
    flushText("main");
    log({ kind: "error", agent: "main", text: msg });
    emit({ type: "error", message: msg });
    status = "paused";
  } finally {
    persistReads("main", mainCtx.readSet);
    flushText("main");
  }

  // ---- bookkeeping
  if (!t.qid) {
    const m = t.log.map((e) => e.path ?? "").join("\n").match(/wiki\/questions\/(q-\d{4})\//);
    if (m) {
      t.qid = m[1];
      t.title = `${m[1]} · ${t.title.replace(/^\/cb_ask\s*/, "")}`.slice(0, 140);
    }
  }
  if (command) t.lastCommand = command;
  const last = t.main[t.main.length - 1];
  t.awaiting = t.pending ? "answer" : status === "paused" || (last && last.role === "user") ? "continue" : "analyst";
  t.final = finalText;
  if (status === "max_rounds") log({ kind: "note", agent: "app", text: `Stopped after ${config.maxRounds} tool rounds. Send "continue" to carry on.` });

  try {
    await saveThread(repo, t);
  } catch (e) {
    emit({ type: "error", message: `Could not save thread state: ${(e as Error).message}` });
  }
  emit({ type: "done", status, awaiting: t.awaiting, threadId: t.id, qid: t.qid, text: finalText, questions: pendingQuestions });
}
