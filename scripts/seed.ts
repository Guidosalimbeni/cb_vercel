/**
 * Push the scaffold (wiki/, .claude/, raw/, CLAUDE.md) from this repo into the content
 * repo as one commit, using the git data API. Only needed to (re)initialise a content repo.
 *
 *   GITHUB_TOKEN=... GITHUB_REPO=owner/name GITHUB_BRANCH=main npm run seed
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPO;
const branch = process.env.GITHUB_BRANCH || "main";
if (!token || !repo) {
  console.error("Set GITHUB_TOKEN and GITHUB_REPO");
  process.exit(1);
}
const api = `https://api.github.com/repos/${repo}`;
const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "cb-seed" };

async function gh(p: string, init?: RequestInit): Promise<any> {
  const r = await fetch(api + p, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${p}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function walk(dir: string, out: string[]): Promise<void> {
  for (const it of await fs.readdir(dir, { withFileTypes: true })) {
    if (it.name === "node_modules" || it.name === ".git" || it.name === ".next") continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) await walk(full, out);
    else out.push(full);
  }
}

async function main() {
  const root = process.cwd();
  const files: string[] = [];
  for (const d of ["wiki", ".claude", "raw"]) await walk(path.join(root, d), files);
  files.push(path.join(root, "CLAUDE.md"));

  const tree: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
  for (const f of files) {
    const content = await fs.readFile(f);
    const blob = await gh("/git/blobs", { method: "POST", body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }) });
    tree.push({ path: path.relative(root, f).split(path.sep).join("/"), mode: "100644", type: "blob", sha: blob.sha });
  }
  let parents: string[] = [];
  let baseTree: string | undefined;
  try {
    const ref = await gh(`/git/ref/heads/${branch}`);
    parents = [ref.object.sha];
    const commit = await gh(`/git/commits/${ref.object.sha}`);
    baseTree = commit.tree.sha;
  } catch {
    /* empty repo */
  }
  const newTree = await gh("/git/trees", { method: "POST", body: JSON.stringify({ tree, ...(baseTree ? { base_tree: baseTree } : {}) }) });
  const commit = await gh("/git/commits", { method: "POST", body: JSON.stringify({ message: "Seed causal brain scaffold", tree: newTree.sha, parents }) });
  if (parents.length) await gh(`/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
  else await gh("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) });
  console.log(`Seeded ${tree.length} files into ${repo}@${branch} as ${commit.sha.slice(0, 7)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
