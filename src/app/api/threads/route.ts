import { requireAuth } from "@/lib/auth";
import { getRepo } from "@/lib/server";
import { listThreads, loadThread, summarize } from "@/lib/threads";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = await requireAuth();
  if (denied) return denied;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  try {
    const repo = await getRepo(url.searchParams.get("fresh") === "1");
    if (id) {
      const t = loadThread(repo, id);
      if (!t) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json({ thread: summarize(t), log: t.log, usage: t.usage, agents: Object.keys(t.agents) });
    }
    return Response.json({ threads: listThreads(repo), store: repo.store.label });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
