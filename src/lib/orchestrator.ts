import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { getStore } from "./store";
import { Repo } from "./repo";
import { loadAgents, loadCommands, loadSkills, expandCommand, type AgentDef, type SkillInfo } from "./definitions";
import { buildMainSystem, buildSubagentSystem, TECHNICIAN_NOTE } from "./prompts";
import { STORAGE_TOOL_DEFS, executeStorageTool, isStorageTool, storageTools, toolNamesFromAllowlist, type ToolContext, type ToolResult } from "./tools";
import { runAgentLoop, type LoopEvent, type LoopStatus, type StreamClient } from "./runner";
import { loadThread, newThread, saveThread, summarize, type LogEvent, type Thread, type ThreadSummary } from "./threads";
import { fakeClient } from "./fake-client";

export interface RunInput {
  threadId?: string;
  command?: string;
  args?: string;
  message?: string;
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
  | { type: "done"; status: LoopStatus; awaiting: Thread["awaiting"]; threadId: string; qid?: string; text: string }
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
  if (command) {
    const def = commands.find((c) => c.name === command);
    if (!def) {
      emit({ type: "error", message: `Unknown command /${command}. Available: ${commands.map((c) => c.name).join(", ")}` });
      return;
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
  const tools: Anthropic.Messages.ToolUnion[] = [...Object.values(STORAGE_TOOL_DEFS), invokeSubagentTool(agents)];
  if (codeExecution) tools.push({ type: "code_execution_20260120", name: "code_execution" });
  const system = buildMainSystem(repo, { skills, agents, qid: t.qid, commandNames: commands.map((c) => c.name), codeExecution, analyst: input.analyst });

  let status: LoopStatus = "done";
  let finalText = "";
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
  t.awaiting = status === "paused" || (last && last.role === "user") ? "continue" : "analyst";
  if (status === "max_rounds") log({ kind: "note", agent: "app", text: `Stopped after ${config.maxRounds} tool rounds. Send "continue" to carry on.` });

  try {
    await saveThread(repo, t);
  } catch (e) {
    emit({ type: "error", message: `Could not save thread state: ${(e as Error).message}` });
  }
  emit({ type: "done", status, awaiting: t.awaiting, threadId: t.id, qid: t.qid, text: finalText });
}
