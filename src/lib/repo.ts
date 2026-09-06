import { minimatch } from "minimatch";
import type { Snapshot, Store, CommitInfo, WriteResult } from "./store";

export class PathError extends Error {}

/** Normalise a repo-relative path the way the model tends to write it. */
export function normalizePath(p: string): string {
  let s = (p ?? "").trim().replace(/\\/g, "/");
  s = s.replace(/^\.\//, "").replace(/^\/+/, "");
  const parts: string[] = [];
  for (const seg of s.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") throw new PathError(`Path escapes the repository: ${p}`);
    parts.push(seg);
  }
  return parts.join("/");
}

export interface GrepOptions {
  pattern: string;
  path?: string;
  glob?: string;
  outputMode?: "files_with_matches" | "content" | "count";
  ignoreCase?: boolean;
  lineNumbers?: boolean;
  before?: number;
  after?: number;
  headLimit?: number;
  multiline?: boolean;
}

export interface DirEntry {
  name: string;
  dir: boolean;
}

/**
 * The content repository, held in memory for one run. Reads are free; writes go
 * through the store (one commit each) and update the snapshot so later reads
 * see them.
 */
export class Repo {
  constructor(
    public snapshot: Snapshot,
    public store: Store,
  ) {}

  paths(): string[] {
    return [...this.snapshot.files.keys(), ...this.snapshot.binary].sort();
  }

  exists(p: string): boolean {
    return this.snapshot.files.has(p) || this.snapshot.binary.has(p);
  }

  isBinary(p: string): boolean {
    return this.snapshot.binary.has(p);
  }

  isDir(p: string): boolean {
    if (p === "") return true;
    const prefix = p + "/";
    for (const k of this.snapshot.files.keys()) if (k.startsWith(prefix)) return true;
    for (const k of this.snapshot.binary) if (k.startsWith(prefix)) return true;
    return false;
  }

  read(p: string): string | undefined {
    return this.snapshot.files.get(p);
  }

  listDir(p: string): DirEntry[] {
    const prefix = p === "" ? "" : p + "/";
    const seen = new Map<string, boolean>();
    for (const k of this.paths()) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) seen.set(rest, false);
      else seen.set(rest.slice(0, slash), true);
    }
    return [...seen.entries()]
      .map(([name, dir]) => ({ name, dir }))
      .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  }

  glob(pattern: string, base = ""): string[] {
    const prefix = base === "" ? "" : base + "/";
    const pat = pattern.replace(/^\.\//, "").replace(/^\/+/, "");
    const opts = { dot: true, matchBase: !pat.includes("/") };
    return this.paths().filter((k) => k.startsWith(prefix) && minimatch(k.slice(prefix.length), pat, opts));
  }

  grep(o: GrepOptions): string {
    const base = o.path ? normalizePath(o.path) : "";
    let flags = "g";
    if (o.ignoreCase) flags += "i";
    if (o.multiline) flags += "ms";
    let re: RegExp;
    try {
      re = new RegExp(o.pattern, flags);
    } catch (e) {
      throw new PathError(`Invalid regex: ${(e as Error).message}`);
    }
    const isFile = base !== "" && this.exists(base);
    const candidates = isFile
      ? [base]
      : this.paths().filter((k) => {
          if (base !== "" && !k.startsWith(base + "/")) return false;
          if (o.glob && !minimatch(k, o.glob, { dot: true, matchBase: !o.glob.includes("/") })) return false;
          return true;
        });
    const mode = o.outputMode ?? "files_with_matches";
    const out: string[] = [];
    const limit = o.headLimit && o.headLimit > 0 ? o.headLimit : mode === "content" ? 250 : 1000;
    let total = 0;

    for (const p of candidates) {
      const text = this.snapshot.files.get(p);
      if (text === undefined) continue;
      if (o.multiline) {
        re.lastIndex = 0;
        const matches = [...text.matchAll(re)];
        if (!matches.length) continue;
        total++;
        if (mode === "files_with_matches") out.push(p);
        else if (mode === "count") out.push(`${p}:${matches.length}`);
        else {
          for (const m of matches) {
            const line = text.slice(0, m.index).split("\n").length;
            out.push(`${p}:${line}:${m[0].split("\n")[0]}`);
          }
        }
        continue;
      }
      const lines = text.split("\n");
      const hit: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
        if (re.test(lines[i])) hit.push(i);
      }
      if (!hit.length) continue;
      total++;
      if (mode === "files_with_matches") out.push(p);
      else if (mode === "count") out.push(`${p}:${hit.length}`);
      else {
        const before = o.before ?? 0;
        const after = o.after ?? 0;
        const show = new Set<number>();
        for (const i of hit) for (let j = Math.max(0, i - before); j <= Math.min(lines.length - 1, i + after); j++) show.add(j);
        const ordered = [...show].sort((a, b) => a - b);
        let prev = -2;
        for (const j of ordered) {
          if (before + after > 0 && prev !== -2 && j !== prev + 1) out.push("--");
          const sep = hit.includes(j) ? ":" : "-";
          out.push(o.lineNumbers === false ? `${p}${sep}${lines[j]}` : `${p}${sep}${j + 1}${sep}${lines[j]}`);
          prev = j;
        }
      }
      if (out.length >= limit) break;
    }
    if (!out.length) return "No matches found";
    const shown = out.slice(0, limit);
    const trailer = out.length > limit ? `\n[${out.length - limit} more lines not shown; use head_limit or a narrower path]` : "";
    const head = mode === "files_with_matches" ? `Found ${total} file${total === 1 ? "" : "s"}\n` : "";
    return head + shown.join("\n") + trailer;
  }

  async write(p: string, content: string, info: CommitInfo): Promise<WriteResult> {
    const previous = this.snapshot.files.has(p) ? this.snapshot.files.get(p)! : this.snapshot.binary.has(p) ? "" : null;
    const result = await this.store.put(p, content, previous, info);
    this.snapshot.binary.delete(p);
    this.snapshot.files.set(p, content);
    return result;
  }
}

/** Claude Code's Read output: `cat -n` style, 1-indexed, tab after the number. */
export function numberedLines(text: string, offset = 1, limit = 2000): string {
  const lines = text.split("\n");
  const start = Math.max(1, offset);
  const slice = lines.slice(start - 1, start - 1 + limit);
  const width = String(start + slice.length).length;
  const body = slice
    .map((l, i) => `${String(start + i).padStart(Math.max(6, width))}\t${l.length > 2000 ? l.slice(0, 2000) + "…" : l}`)
    .join("\n");
  const rest = lines.length - (start - 1 + slice.length);
  return rest > 0 ? `${body}\n\n[${rest} more lines; use offset=${start + slice.length} to continue]` : body;
}
