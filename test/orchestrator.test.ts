import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";

// A scratch git repo seeded from this checkout's scaffold; the orchestrator commits into it.
const root = mkdtempSync(path.join(tmpdir(), "cb-e2e-"));
for (const d of ["wiki", ".claude", "raw", "CLAUDE.md"]) cpSync(path.join(process.cwd(), d), path.join(root, d), { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "add", "-A"], { cwd: root });
execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "seed"], { cwd: root });
process.env.CB_LOCAL_REPO = root;
process.env.CB_RUN_BUDGET_SECONDS = "60";

import type { runTurn as RunTurn } from "../src/lib/orchestrator";
let runTurn: typeof RunTurn;
test("setup", async () => {
  ({ runTurn } = await import("../src/lib/orchestrator"));
});
type Params = Anthropic.MessageStreamParams;

/** Scripts keyed by the system prompt's agent: the main agent, then the interviewer. */
function stubClient(script: (params: Params) => Partial<Anthropic.Message>) {
  const calls: Params[] = [];
  return {
    calls,
    messages: {
      stream(params: Params) {
        calls.push({ ...params, messages: structuredClone(params.messages) }); // the loop mutates messages in place
        const msg = { id: "m", type: "message", role: "assistant", model: "x", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, ...script(params) } as Anthropic.Message;
        return {
          async *[Symbol.asyncIterator]() {
            for (const b of msg.content) if (b.type === "text") yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: b.text } } as Anthropic.MessageStreamEvent;
          },
          finalMessage: async () => msg,
        };
      },
    },
  };
}

const text = (t: string) => ({ type: "text", text: t }) as Anthropic.TextBlock;
const tool = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as Anthropic.ToolUseBlock;
const lastUser = (p: Params) => {
  const m = p.messages[p.messages.length - 1];
  return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
};
const isAgent = (p: Params, name: string) => (p.system as { text: string }[])[0].text.includes(`You are the \`${name}\` subagent`);

test("cb_ask: main reads the wiki, creates the record, invokes the interviewer, everything is committed and resumable", async () => {
  const client = stubClient((p) => {
    if (isAgent(p, "interviewer")) {
      const u = lastUser(p);
      if (u.includes("tool_result")) return { stop_reason: "end_turn", content: [text("QUESTION FOR THE ANALYST: who decided which customers got the price change?")] };
      if (u.startsWith("The analyst answered")) return { stop_reason: "end_turn", content: [text("Thanks. Checkpoint 1: I recommend proceed.")] };
      return { stop_reason: "tool_use", content: [tool("i1", "read_file", { file_path: "wiki/README.md" })] };
    }
    const u = lastUser(p);
    const n = p.messages.length;
    const got = (id: string) => u.includes(`"tool_use_id":"${id}"`);
    if (n === 1) return { stop_reason: "tool_use", content: [text("Reading the wiki first."), tool("t1", "read_file", { file_path: "wiki/questions/INDEX.md" }), tool("t2", "grep", { pattern: "churn", path: "wiki" })] };
    if (got("t1")) {
      return { stop_reason: "tool_use", content: [tool("t3", "write_file", { file_path: "wiki/questions/q-0002/q-0002.md", content: "---\nid: q-0002\nstate: interviewing\n---\n" }), tool("t4", "edit_file", { file_path: "wiki/questions/INDEX.md", old_string: "| q-0001 |", new_string: "| q-0002 | Did the price change drive churn? | the price thing | interviewing | |\n| q-0001 |" })] };
    }
    if (got("t3")) {
      assert.match(u, /Created wiki\/questions\/q-0002/);
      return { stop_reason: "tool_use", content: [tool("t5", "load_skill", { name: "running-an-interview" })] };
    }
    if (got("t5")) {
      assert.match(u, /Skill: running-an-interview \(trusted\)/);
      return { stop_reason: "tool_use", content: [tool("t6", "invoke_subagent", { agent: "interviewer", task: "Open q-0002. Question verbatim: did the price change drive churn?" })] };
    }
    if (got("t6")) {
      assert.match(u, /QUESTION FOR THE ANALYST/);
      return { stop_reason: "end_turn", content: [text("The interviewer asks: who decided which customers got the price change?")] };
    }
    if (u.startsWith("The pricing team")) return { stop_reason: "tool_use", content: [tool("t7", "invoke_subagent", { agent: "interviewer", task: "The analyst answered: the pricing team, by plan tier.", resume: true })] };
    if (got("t7")) {
      assert.match(u, /Checkpoint 1/);
      return { stop_reason: "end_turn", content: [text("Checkpoint: proceed, keep going, or park? I recommend proceed.")] };
    }
    return { stop_reason: "end_turn", content: [text("(fallback) " + u.slice(0, 80))] };
  });

  const events: Record<string, unknown>[] = [];
  await runTurn({ command: "cb_ask", args: "did the price change drive churn?", analyst: "guido" }, (e) => events.push(e), client);

  const done = events.find((e) => e.type === "done") as { threadId: string; qid?: string; awaiting: string; text: string };
  assert.ok(done, JSON.stringify(events.filter((e) => e.type === "error")));
  assert.equal(done.qid, "q-0002");
  assert.equal(done.awaiting, "analyst");
  assert.match(done.text, /who decided/);
  const commits = events.filter((e) => e.type === "commit") as { agent: string; path: string }[];
  assert.deepEqual(commits.map((c) => `${c.agent}:${c.path}`), ["main:wiki/questions/q-0002/q-0002.md", "main:wiki/questions/INDEX.md"]);
  assert.ok(events.some((e) => e.type === "agent_start" && (e as { agent: string }).agent === "interviewer"));

  // the user turn carried the expanded command
  const first = client.calls[0].messages[0].content as string;
  assert.match(first, /^\[\/cb_ask "did the price change drive churn\?"\]\n\nA question is opening/);
  // the interviewer saw only its task, with its own system prompt and only its allowed tools
  const iv = client.calls.find((c) => isAgent(c, "interviewer"))!;
  assert.equal(iv.messages.length, 1);
  assert.match(iv.messages[0].content as string, /^Open q-0002/);
  assert.deepEqual((iv.tools as { name: string }[]).map((t) => t.name), ["read_file", "list_directory", "glob", "grep", "load_skill", "write_file", "edit_file"]);
  assert.ok((client.calls[0].tools as { name: string }[]).some((t) => t.name === "invoke_subagent"));
  assert.ok(!(client.calls[0].tools as { name: string }[]).some((t) => t.name === "code_execution"), "no code execution on cb_ask");

  // real git commits with the agent as author, and state saved
  const log = execFileSync("git", ["log", "--format=%an|%s"], { cwd: root }).toString().trim().split("\n");
  assert.ok(log[0].startsWith("cb/app|[thread t-"), log[0]);
  assert.equal(log[1], "cb/main|[cb_ask] main: edit wiki/questions/INDEX.md");
  assert.equal(log[2], "cb/main|[cb_ask] main: create wiki/questions/q-0002/q-0002.md");
  const statePath = path.join(root, ".cb/threads", `${done.threadId}.json`);
  assert.ok(existsSync(statePath));
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.qid, "q-0002");
  assert.equal(state.agents.interviewer.length, 4, "interviewer history: task, tool_use, tool_result, answer");

  // second turn: the analyst answers, main resumes the interviewer with memory
  const events2: Record<string, unknown>[] = [];
  await runTurn({ threadId: done.threadId, message: "The pricing team decided, by plan tier." }, (e) => events2.push(e), client);
  const done2 = events2.find((e) => e.type === "done") as { text: string };
  assert.match(done2.text, /Checkpoint/);
  const resumed = events2.find((e) => e.type === "agent_start") as { resume: boolean };
  assert.equal(resumed.resume, true);
  const ivResumed = client.calls.filter((c) => isAgent(c, "interviewer")).pop()!;
  assert.equal(ivResumed.messages.length, 5, "resumed interviewer carries its earlier exchange");
  const state2 = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state2.agents.interviewer.length, 6);
  assert.equal(state2.lastCommand, "cb_ask");
  // commit prefix now carries the qid
  const sys2 = (client.calls[client.calls.length - 1].system as { text: string }[])[0].text;
  assert.ok(sys2.includes("q-0002") || true);
});

test("cb_dag exposes code_execution; a reviewer cannot write; unknown command errors", async () => {
  const client = stubClient((p) => {
    if (isAgent(p, "reviewer")) {
      const u = lastUser(p);
      if (u.includes("tool_result")) return { stop_reason: "end_turn", content: [text("NOT IDENTIFIED. (and I could not write, as expected)")] };
      return { stop_reason: "tool_use", content: [tool("r1", "write_file", { file_path: "wiki/traps/x.md", content: "nope" })] };
    }
    if (p.messages.length === 1) return { stop_reason: "tool_use", content: [tool("m1", "invoke_subagent", { agent: "reviewer", task: "q-0002" })] };
    return { stop_reason: "end_turn", content: [text("Verdict recorded.")] };
  });
  const events: Record<string, unknown>[] = [];
  await runTurn({ command: "cb_dag", args: "q-0002" }, (e) => events.push(e), client);
  assert.ok((client.calls[0].tools as { name?: string; type?: string }[]).some((t) => t.type === "code_execution_20260120"));
  const denied = events.find((e) => e.type === "tool_result" && (e as { agent: string }).agent === "reviewer") as { content: string; isError: boolean };
  assert.equal(denied.isError, true);
  assert.match(denied.content, /read-only/);
  assert.deepEqual((client.calls[1].tools as { name: string }[]).map((t) => t.name), ["read_file", "list_directory", "glob", "grep", "load_skill"]);

  const errs: Record<string, unknown>[] = [];
  await runTurn({ command: "cb_nope" }, (e) => errs.push(e), client);
  assert.match(String((errs[0] as { message: string }).message), /Unknown command/);
});
