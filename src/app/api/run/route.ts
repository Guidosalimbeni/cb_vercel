import { requireAuth } from "@/lib/auth";
import { runTurn, type RunInput, type SSEEvent } from "@/lib/orchestrator";
import { invalidateRepo } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel Hobby with Fluid Compute allows up to 300s. CB_RUN_BUDGET_SECONDS pauses the run before that. */
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as RunInput;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: SSEEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const ping = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(enc.encode(`: ping\n\n`));
          } catch {
            closed = true;
          }
        }
      }, 15_000);
      try {
        await runTurn(body, send);
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        clearInterval(ping);
        invalidateRepo();
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
