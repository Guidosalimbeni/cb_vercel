import type Anthropic from "@anthropic-ai/sdk";
import type { StreamClient } from "./runner";

/**
 * A stand-in for the API used only when CB_FAKE_MODEL=1: reads one file, then answers.
 * It exercises the whole app (snapshot, tools, commits, state, streaming UI) without an API key.
 */
export function fakeClient(): StreamClient {
  return {
    messages: {
      stream(params: Anthropic.MessageStreamParams) {
        const last = params.messages[params.messages.length - 1];
        const n = params.messages.length;
        const lastText = typeof last.content === "string" ? last.content : JSON.stringify(last.content);
        const hasAsk = (params.tools ?? []).some((t) => (t as { name?: string }).name === "ask_analyst");
        let content: Anthropic.ContentBlock[];
        let stop: Anthropic.Message["stop_reason"] = "end_turn";
        if (n === 1) {
          content = [
            { type: "text", text: "(fake model) Reading the wiki index first." } as Anthropic.TextBlock,
            { type: "tool_use", id: `fake-${Date.now()}`, name: "read_file", input: { file_path: "wiki/questions/INDEX.md" } } as Anthropic.ToolUseBlock,
          ];
          stop = "tool_use";
        } else if (hasAsk && !lastText.includes("The analyst") && n < 5) {
          content = [
            { type: "text", text: "(fake model) The wiki already has **30-day churn** with two confirmed causes. One thing it does not settle:" } as Anthropic.TextBlock,
            { type: "tool_use", id: `ask-${Date.now()}`, name: "ask_analyst", input: { questions: [{ question: "When it comes to running this, where is the data?", header: "Data mode", options: [{ label: "Live", description: "a real connection in your environment" }, { label: "Sample", description: "an extract you can hand over" }, { label: "Simulated", description: "nothing yet; generate it from the graph" }] }] } } as Anthropic.ToolUseBlock,
          ];
          stop = "tool_use";
        } else {
          content = [{ type: "text", text: `(fake model) Done. I saw ${lastText.includes("The analyst") ? "your answer" : typeof last.content === "string" ? "your message" : "the tool result"}. Set ANTHROPIC_API_KEY and unset CB_FAKE_MODEL to use the real model.` } as Anthropic.TextBlock];
        }
        const msg = { id: "fake", type: "message", role: "assistant", model: "fake", stop_reason: stop, stop_sequence: null, content, usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Anthropic.Message;
        return {
          async *[Symbol.asyncIterator]() {
            for (const b of content) {
              if (b.type !== "text") continue;
              for (const word of b.text.split(" ")) {
                await new Promise((r) => setTimeout(r, 30));
                yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: word + " " } } as Anthropic.MessageStreamEvent;
              }
            }
          },
          finalMessage: async () => msg,
        };
      },
    },
  };
}
