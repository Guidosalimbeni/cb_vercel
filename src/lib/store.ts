import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseTar } from "./tar";
import { config } from "./config";

const execFileP = promisify(execFile);

/** A snapshot of the whole content repo, loaded once per run. */
export interface Snapshot {
  /** path -> utf8 text; binary files are listed in `binary` and absent here */
  files: Map<string, string>;
  binary: Set<string>;
}

export interface CommitInfo {
  message: string;
  /** shown as the git author, e.g. "cb/interviewer" */
  author: string;
}

export interface WriteResult {
  sha: string;
  commit: string;
  url?: string;
}

export interface Store {
  readonly label: string;
  load(): Promise<Snapshot>;
  /** Create or overwrite a file as one commit. `previous` is the content we believe is there (null if new). */
  put(filePath: string, content: string, previous: string | null, info: CommitInfo): Promise<WriteResult>;
  commitUrl(sha: string): string | undefined;
}

export function gitBlobSha(content: string): string {
  const body = Buffer.from(content, "utf8");
  const head = Buffer.from(`blob ${body.length}\0`, "utf8");
  return createHash("sha1").update(Buffer.concat([head, body])).digest("hex");
}

function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export function snapshotFromBuffers(entries: Iterable<[string, Buffer]>): Snapshot {
  const files = new Map<string, string>();
  const binary = new Set<string>();
  for (const [p, buf] of entries) {
    if (isBinary(buf)) binary.add(p);
    else files.set(p, buf.toString("utf8"));
  }
  return { files, binary };
}

/* ------------------------------------------------------------------ GitHub */

export class GitHubStore implements Store {
  readonly label: string;
  private owner: string;
  private repo: string;
  private branch: string;
  private token: string;

  constructor(repo: string, branch: string, token: string) {
    const [owner, name] = repo.split("/");
    if (!owner || !name) throw new Error(`GITHUB_REPO must be owner/name, got "${repo}"`);
    this.owner = owner;
    this.repo = name;
    this.branch = branch;
    this.token = token;
    this.label = `github:${repo}@${branch}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "cb-web",
      ...extra,
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private api(p: string): string {
    return `https://api.github.com/repos/${this.owner}/${this.repo}${p}`;
  }

  async load(): Promise<Snapshot> {
    const res = await fetch(this.api(`/tarball/${encodeURIComponent(this.branch)}`), {
      headers: this.headers(),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`GitHub tarball fetch failed: ${res.status} ${await res.text()}`);
    const gz = Buffer.from(await res.arrayBuffer());
    const tar = gunzipSync(gz);
    const raw = parseTar(tar);
    const entries: [string, Buffer][] = [];
    for (const [p, buf] of raw) {
      const slash = p.indexOf("/");
      if (slash === -1) continue; // the top-level directory itself
      const rel = p.slice(slash + 1);
      if (!rel) continue;
      entries.push([rel, buf]);
    }
    return snapshotFromBuffers(entries);
  }

  private async currentSha(filePath: string): Promise<string | null> {
    const res = await fetch(this.api(`/contents/${encodePath(filePath)}?ref=${encodeURIComponent(this.branch)}`), {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub GET contents failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { sha?: string };
    return json.sha ?? null;
  }

  async put(filePath: string, content: string, previous: string | null, info: CommitInfo): Promise<WriteResult> {
    const attempt = async (sha: string | null): Promise<Response> => {
      const body: Record<string, unknown> = {
        message: info.message,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch: this.branch,
        committer: { name: info.author, email: "cb@users.noreply.github.com" },
        author: { name: info.author, email: "cb@users.noreply.github.com" },
      };
      if (sha) body.sha = sha;
      return fetch(this.api(`/contents/${encodePath(filePath)}`), {
        method: "PUT",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
    };

    let res = await attempt(previous === null ? null : gitBlobSha(previous));
    if (res.status === 409 || res.status === 422) {
      // Our idea of the file was stale (someone else wrote, or it exists when we thought it new).
      const sha = await this.currentSha(filePath);
      res = await attempt(sha);
    }
    if (!res.ok) throw new Error(`GitHub PUT contents failed for ${filePath}: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { content?: { sha?: string }; commit?: { sha?: string; html_url?: string } };
    return { sha: json.content?.sha ?? "", commit: json.commit?.sha ?? "", url: json.commit?.html_url };
  }

  commitUrl(sha: string): string {
    return `https://github.com/${this.owner}/${this.repo}/commit/${sha}`;
  }
}

function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

/* ------------------------------------------------------------------- Local */

/** Local checkout, for development and tests. Every put is a real git commit. */
export class LocalStore implements Store {
  readonly label: string;
  constructor(private root: string) {
    this.label = `local:${root}`;
  }

  async load(): Promise<Snapshot> {
    const entries: [string, Buffer][] = [];
    const walk = async (dir: string) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const it of items) {
        if (it.name === ".git" || it.name === "node_modules") continue;
        const full = path.join(dir, it.name);
        if (it.isDirectory()) await walk(full);
        else if (it.isFile()) entries.push([path.relative(this.root, full).split(path.sep).join("/"), await fs.readFile(full)]);
      }
    };
    await walk(this.root);
    return snapshotFromBuffers(entries);
  }

  async put(filePath: string, content: string, _previous: string | null, info: CommitInfo): Promise<WriteResult> {
    const full = path.join(this.root, filePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
    const git = (...args: string[]) =>
      execFileP("git", ["-c", `user.name=${info.author}`, "-c", "user.email=cb@users.noreply.github.com", ...args], { cwd: this.root });
    await git("add", "--", filePath);
    await git("commit", "-q", "--allow-empty", "-m", info.message, "--", filePath);
    const { stdout } = await git("rev-parse", "HEAD");
    return { sha: gitBlobSha(content), commit: stdout.trim() };
  }

  commitUrl(): undefined {
    return undefined;
  }
}

export function getStore(): Store {
  if (config.localRepo) return new LocalStore(config.localRepo);
  if (!config.github.repo) throw new Error("Set GITHUB_REPO (owner/name) and GITHUB_TOKEN, or CB_LOCAL_REPO for local development.");
  return new GitHubStore(config.github.repo, config.github.branch, config.github.token);
}
