import { requireAuth } from "@/lib/auth";
import { getRepo } from "@/lib/server";
import { loadAgents, loadCommands, loadSkills } from "@/lib/definitions";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    const repo = await getRepo();
    return Response.json({
      commands: loadCommands(repo).map(({ name, description, argumentHint }) => ({ name, description, argumentHint })),
      agents: loadAgents(repo).map(({ name, description, tools }) => ({ name, description, tools })),
      skills: loadSkills(repo),
      store: repo.store.label,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
