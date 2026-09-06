import { requireAuth } from "@/lib/auth";
import { getRepo } from "@/lib/server";
import { buildDag } from "@/lib/dag";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    const url = new URL(req.url);
    const repo = await getRepo(url.searchParams.get("fresh") === "1");
    return Response.json(buildDag(repo));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
