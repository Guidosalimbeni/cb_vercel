import { requireAuth } from "@/lib/auth";
import { getRepo } from "@/lib/server";
import { normalizePath } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = await requireAuth();
  if (denied) return denied;
  const url = new URL(req.url);
  try {
    const p = normalizePath(url.searchParams.get("path") ?? "");
    const repo = await getRepo(url.searchParams.get("fresh") === "1");
    if (repo.exists(p)) {
      return Response.json({ path: p, kind: "file", binary: repo.isBinary(p), content: repo.read(p) ?? null });
    }
    if (repo.isDir(p)) return Response.json({ path: p, kind: "dir", entries: repo.listDir(p) });
    return Response.json({ error: `not found: ${p}` }, { status: 404 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
