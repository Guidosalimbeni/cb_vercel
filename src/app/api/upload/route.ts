import { requireAuth } from "@/lib/auth";
import { getRepo, invalidateRepo } from "@/lib/server";
import { normalizePath } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Where the analyst may drop material: raw/ (immutable to agents), question data and results. */
const ALLOWED = [/^raw\/[^/]+$/, /^wiki\/questions\/q-\d{4}\/data\/[^/]+$/, /^wiki\/questions\/q-\d{4}\/result\/[^/]+$/];

export async function POST(req: Request): Promise<Response> {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { path?: string; content?: string; analyst?: string };
  try {
    const p = normalizePath(body.path ?? "");
    if (!ALLOWED.some((re) => re.test(p))) return Response.json({ error: `Uploads go to raw/<file>, wiki/questions/<qid>/data/<file> or wiki/questions/<qid>/result/<file>; got ${p}` }, { status: 400 });
    if (typeof body.content !== "string" || !body.content.length) return Response.json({ error: "content is required" }, { status: 400 });
    if (body.content.length > 900_000) return Response.json({ error: "file too large for this demo (max ~900KB)" }, { status: 413 });
    const repo = await getRepo(true);
    const existed = repo.exists(p);
    const res = await repo.write(p, body.content, { message: `[upload] ${body.analyst || "analyst"}: ${existed ? "update" : "add"} ${p}`, author: `cb/${body.analyst || "analyst"}` });
    invalidateRepo();
    return Response.json({ ok: true, path: p, commit: res.commit, url: res.url, existed });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
