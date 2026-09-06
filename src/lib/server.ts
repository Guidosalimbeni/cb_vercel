import { Repo } from "./repo";
import { getStore } from "./store";

let cached: { repo: Repo; at: number } | null = null;
const TTL_MS = 10_000;

/** A fresh-enough repo for read-only UI routes. Runs always load their own. */
export async function getRepo(fresh = false): Promise<Repo> {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.repo;
  const store = getStore();
  const repo = new Repo(await store.load(), store);
  cached = { repo, at: Date.now() };
  return repo;
}

export function invalidateRepo(): void {
  cached = null;
}
