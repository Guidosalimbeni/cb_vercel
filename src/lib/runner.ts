import type Anthropic from "@anthropic-ai/sdk";
import type { Effort } from "./config";
import type { ToolResult } from "./tools";

export type MessageParam = Anthropic.MessageParam;

export type LoopEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; content: string; isError: boolean }
  | { type: "server_tool"; name: string; summary: string }
  | { type: "usage"; input: number; output: number; cacheRead: number };

/** The slice of the Anthropic client the loop needs; tests inject a stub. */
export interface StreamClient {
  messages: {
    stream: (params: Anthropic.MessageStreamParams) => AsyncIterable<Anthropic.MessageStreamEvent> & { finalMessage(): Promise<Anthropic.Message> };
  };
}

export interface LoopOptions {
  client: StreamClient;
  model: string;
  system: string;
  tools: Anthropic.Messages.ToolUnion[];
  /** mutated in place: every assistant turn and tool-result turn is appended */
  messages: MessageParam[];
  maxTokens: number;
  effort: Effort;
  showThinking: boolean;
  execute: (name: string, input: unknown) => Promise<ToolResult>;
  onEvent: (e: LoopEvent) => void;
  /** epoch ms; the loop pauses (between rounds, state consistent) once passed */
  deadline: number;
  maxRounds: number;
}

export type LoopStatus = "done" | "paused" | "max_rounds" | "refusal";

export interface LoopResult {
  status: LoopStatus;
  finalText: string;
  rounds: number;
}

export function textOf(content: Anthropic.ContentBlock[] | MessageParam["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is Anthropic.TextBlock => (b as { type: string }).type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** The manual agentic loop: stream, execute client tools, resume pause_turn, stop at end_turn. */
export async function runAgentLoop(o: LoopOptions): Promise<LoopResult> {
  let rounds = 0;
  let truncations = 0;
  let lastText = "";

  while (rounds < o.maxRounds) {
    if (Date.now() > o.deadline && rounds > 0) return { status: "paused", finalText: lastText, rounds };
    rounds++;

    const params: Anthropic.MessageStreamParams = {
      model: o.model,
      max_tokens: o.maxTokens,
      system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }],
      tools: o.tools,
      messages: o.messages,
      thinking: { type: "adaptive", display: o.showThinking ? "summarized" : "omitted" },
      output_config: { effort: o.effort },
    };
    const stream = o.client.messages.stream(params);
    for await (const ev of stream) {
      if (ev.type === "content_block_delta") {
        if (ev.delta.type === "text_delta") o.onEvent({ type: "text", delta: ev.delta.text });
        else if (ev.delta.type === "thinking_delta" && o.showThinking) o.onEvent({ type: "thinking", delta: ev.delta.thinking });
      } else if (ev.type === "content_block_start" && ev.content_block.type === "server_tool_use") {
        o.onEvent({ type: "server_tool", name: ev.content_block.name, summary: "started" });
      }
    }
    const msg = await stream.finalMessage();
    o.messages.push({ role: "assistant", content: msg.content });
    o.onEvent({
      type: "usage",
      input: msg.usage.input_tokens,
      output: msg.usage.output_tokens,
      cacheRead: msg.usage.cache_read_input_tokens ?? 0,
    });
    for (const b of msg.content) {
      if (b.type === "bash_code_execution_tool_result") {
        const r = b.content as { type: string; stdout?: string; stderr?: string; return_code?: number; error_code?: string };
        o.onEvent({ type: "server_tool", name: "code_execution", summary: r.type === "bash_code_execution_result" ? `exit ${r.return_code}\n${(r.stdout ?? "").slice(0, 1500)}${r.stderr ? "\nstderr: " + r.stderr.slice(0, 500) : ""}` : `error ${r.error_code ?? ""}` });
      }
    }
    lastText = textOf(msg.content) || lastText;

    if (msg.stop_reason === "pause_turn") continue;
    if (msg.stop_reason === "refusal") return { status: "refusal", finalText: lastText || "(the model declined this request)", rounds };

    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUses.length) {
      if (msg.stop_reason === "max_tokens" && truncations < 2) {
        truncations++;
        o.messages.push({ role: "user", content: "Your previous response was cut off by the token limit. Continue exactly from where you stopped, without repeating what you already said." });
        continue;
      }
      return { status: "done", finalText: lastText, rounds };
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      o.onEvent({ type: "tool_call", id: tu.id, name: tu.name, input: tu.input });
      let r: ToolResult;
      try {
        r = await o.execute(tu.name, tu.input);
      } catch (e) {
        r = { content: `Tool failed: ${(e as Error).message}`, isError: true };
      }
      const content = r.content === "" ? "(no output)" : r.content;
      o.onEvent({ type: "tool_result", id: tu.id, name: tu.name, content, isError: !!r.isError });
      results.push({ type: "tool_result", tool_use_id: tu.id, content, ...(r.isError ? { is_error: true } : {}) });
    }
    o.messages.push({ role: "user", content: results });
  }
  return { status: "max_rounds", finalText: lastText, rounds };
}

/** If a run was cut off after an assistant tool_use with no results, close it so the API accepts the history. */
export function repairHistory(messages: MessageParam[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || typeof last.content === "string") return false;
  const pending = last.content.filter((b): b is Anthropic.ToolUseBlockParam => b.type === "tool_use");
  if (!pending.length) return false;
  messages.push({
    role: "user",
    content: pending.map((p) => ({ type: "tool_result" as const, tool_use_id: p.id, content: "The run was interrupted before this tool ran. Call it again if it is still needed.", is_error: true })),
  });
  return true;
}
