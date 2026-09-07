import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop, repairHistory, type StreamClient, type MessageParam } from "../src/lib/runner";

/** A scripted stand-in for the API: each call pops the next message. */
function scripted(turns: Partial<Anthropic.Message>[]): StreamClient & { calls: Anthropic.MessageStreamParams[] } {
  const calls: Anthropic.MessageStreamParams[] = [];
  return {
    calls,
    messages: {
      stream(params) {
        calls.push(params);
        const next = turns.shift();
        if (!next) throw new Error("script exhausted");
        const msg = { id: "m", type: "message", role: "assistant", model: "x", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 }, ...next } as Anthropic.Message;
        const events: Anthropic.MessageStreamEvent[] = msg.content
          .filter((b) => b.type === "text")
          .map((b) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: (b as Anthropic.TextBlock).text } }) as Anthropic.MessageStreamEvent);
        const it = {
          async *[Symbol.asyncIterator]() {
            for (const e of events) yield e;
          },
          finalMessage: async () => msg,
        };
        return it;
      },
    },
  };
}

test("loop executes tools, feeds results back, stops at end_turn", async () => {
  const client = scripted([
    { stop_reason: "tool_use", content: [{ type: "text", text: "Reading." } as Anthropic.TextBlock, { type: "tool_use", id: "tu1", name: "read_file", input: { file_path: "wiki/README.md" } } as Anthropic.ToolUseBlock] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Done: the wiki says hello." } as Anthropic.TextBlock] },
  ]);
  const messages: MessageParam[] = [{ role: "user", content: "go" }];
  const seen: string[] = [];
  const result = await runAgentLoop({
    client,
    model: "m",
    system: "sys",
    tools: [],
    messages,
    maxTokens: 100,
    effort: "low",
    showThinking: false,
    execute: async (name, input) => {
      seen.push(`${name}:${JSON.stringify(input)}`);
      return { content: "hello" };
    },
    onEvent: () => {},
    deadline: Date.now() + 60_000,
    maxRounds: 10,
  });
  assert.equal(result.status, "done");
  assert.equal(result.finalText, "Done: the wiki says hello.");
  assert.deepEqual(seen, ['read_file:{"file_path":"wiki/README.md"}']);
  assert.equal(messages.length, 4);
  assert.equal(messages[2].role, "user");
  assert.deepEqual(messages[2].content, [{ type: "tool_result", tool_use_id: "tu1", content: "hello" }]);
  assert.equal(client.calls.length, 2);
  assert.equal((client.calls[0].system as { text: string }[])[0].text, "sys");
});

test("loop pauses between rounds once past the deadline, leaving consistent history", async () => {
  const client = scripted([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "grep", input: { pattern: "x" } } as Anthropic.ToolUseBlock] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "never reached" } as Anthropic.TextBlock] },
  ]);
  const messages: MessageParam[] = [{ role: "user", content: "go" }];
  const result = await runAgentLoop({
    client, model: "m", system: "s", tools: [], messages, maxTokens: 10, effort: "low", showThinking: false,
    execute: async () => ({ content: "r" }),
    onEvent: () => {},
    deadline: Date.now() - 1,
    maxRounds: 10,
  });
  assert.equal(result.status, "paused");
  assert.equal(messages[messages.length - 1].role, "user");
});

test("repairHistory closes a dangling tool_use", () => {
  const messages: MessageParam[] = [
    { role: "user", content: "go" },
    { role: "assistant", content: [{ type: "tool_use", id: "tu9", name: "read_file", input: {} }] },
  ];
  assert.equal(repairHistory(messages), true);
  assert.equal(messages.length, 3);
  assert.equal(repairHistory(messages), false);
});

test("a pausing tool stops the loop with the other tool results collected", async () => {
  const client = scripted([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "r1", name: "read_file", input: { file_path: "x" } } as Anthropic.ToolUseBlock, { type: "tool_use", id: "a1", name: "ask_analyst", input: { questions: [] } } as Anthropic.ToolUseBlock] },
  ]);
  const messages: MessageParam[] = [{ role: "user", content: "go" }];
  const result = await runAgentLoop({
    client, model: "m", system: "s", tools: [], messages, maxTokens: 10, effort: "low", showThinking: false,
    execute: async (name) => (name === "ask_analyst" ? { content: "", pause: [{ question: "Q?", options: [] }] } : { content: "file body" }),
    onEvent: () => {},
    deadline: Date.now() + 60_000,
    maxRounds: 10,
  });
  assert.equal(result.status, "awaiting_input");
  assert.equal(result.pending?.toolUseId, "a1");
  assert.deepEqual(result.pending?.partialResults, [{ type: "tool_result", tool_use_id: "r1", content: "file body" }]);
  assert.equal(messages.length, 2, "no tool_result message pushed while waiting");
  assert.equal(messages[1].role, "assistant");
});
