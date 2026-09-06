import type Anthropic from "@anthropic-ai/sdk";
import { Repo, PathError, normalizePath, numberedLines } from "./repo";

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface CommitEvent {
  path: string;
  commit: string;
  url?: string;
  message: string;
}

export interface ToolContext {
  repo: Repo;
  /** the agent running the tool, e.g. "main" or "interviewer" */
  agent: string;
  canWrite: boolean;
  /** files this agent has read on this thread; Write/Edit refuse a file that was not read first */
  readSet: Set<string>;
  /** "[cb_ask q-0003]" — prefixes every commit message */
  commitPrefix: string;
  onCommit?: (e: CommitEvent) => void;
}

/** Paths nobody may read: conversation state must stay invisible to reviewer and librarian. */
const HIDDEN_PREFIXES = [".cb/"];
/** Where agents may write. raw/ is immutable by house rule; uploads bypass this through the UI. */
const WRITABLE_PREFIXES = ["wiki/", ".claude/"];

function hidden(p: string): boolean {
  return HIDDEN_PREFIXES.some((h) => p === h.slice(0, -1) || p.startsWith(h));
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : undefined);

export const STORAGE_TOOL_DEFS: Record<string, Anthropic.Tool> = {
  read_file: {
    name: "read_file",
    description:
      "Read a file from the repository (Claude Code's Read). Returns the content with line numbers, `cat -n` style. Reads up to 2000 lines by default; use offset and limit for long files. Paths are relative to the repository root, e.g. wiki/README.md. You must read a file before you can write_file over it or edit_file it.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Repository-relative path of the file to read" },
        offset: { type: "number", description: "1-indexed line number to start from (optional)" },
        limit: { type: "number", description: "Maximum number of lines to return (optional)" },
      },
      required: ["file_path"],
    },
  },
  write_file: {
    name: "write_file",
    description:
      "Create a file or overwrite an existing one with the full content (Claude Code's Write). Every call is one git commit in the content repository, attributed to you. Overwriting requires having read the file first. Prefer edit_file for changes to an existing file.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Repository-relative path" },
        content: { type: "string", description: "The complete new content of the file" },
      },
      required: ["file_path", "content"],
    },
  },
  edit_file: {
    name: "edit_file",
    description:
      "Exact string replacement in a file (Claude Code's Edit). old_string must match the file exactly, including indentation, and must be unique in the file unless replace_all is true. Read the file first. One git commit per call.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Repository-relative path" },
        old_string: { type: "string", description: "The exact text to replace" },
        new_string: { type: "string", description: "The replacement text (must differ from old_string)" },
        replace_all: { type: "boolean", description: "Replace every occurrence (default false)" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  list_directory: {
    name: "list_directory",
    description: "List the files and subdirectories directly inside a directory (Claude Code's LS). Directories end with '/'. Use '' or '.' for the repository root.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Repository-relative directory path" } },
      required: ["path"],
    },
  },
  glob: {
    name: "glob",
    description:
      "Find files by glob pattern (Claude Code's Glob), e.g. \"wiki/concepts/*.md\", \"**/*.ipynb\", \"wiki/questions/q-00*/**\". Returns matching paths sorted by path (not by modification time: the repository is on GitHub).",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern to match files against" },
        path: { type: "string", description: "Directory to search in (optional; default is the repository root)" },
      },
      required: ["pattern"],
    },
  },
  grep: {
    name: "grep",
    description:
      "Search file contents with a regular expression (Claude Code's Grep; JavaScript regex syntax). Default output_mode is files_with_matches; use \"content\" to see matching lines with line numbers, \"count\" for match counts per file. Filter by path prefix and/or glob. This is what to use wherever a prompt says `rg` or `grep -rn`.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression to search for" },
        path: { type: "string", description: "File or directory to search in (optional; default is the whole repository)" },
        glob: { type: "string", description: "Glob to filter files, e.g. \"*.md\" (optional)" },
        output_mode: { type: "string", enum: ["files_with_matches", "content", "count"], description: "Default files_with_matches" },
        "-i": { type: "boolean", description: "Case-insensitive" },
        "-n": { type: "boolean", description: "Show line numbers in content mode (default true)" },
        "-A": { type: "number", description: "Lines of context after each match (content mode)" },
        "-B": { type: "number", description: "Lines of context before each match (content mode)" },
        "-C": { type: "number", description: "Lines of context before and after (content mode)" },
        head_limit: { type: "number", description: "Limit output to the first N lines/entries" },
        multiline: { type: "boolean", description: "Let the pattern span lines (. matches newlines)" },
      },
      required: ["pattern"],
    },
  },
  load_skill: {
    name: "load_skill",
    description:
      "Load a skill's instructions (Claude Code's Skill tool). Use it whenever a command or agent says to \"invoke the <name> skill\". Looks in .claude/skills/ (trusted) then .claude/skills-staging/ (unproven). Returns the SKILL.md content, which you then follow.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "The skill name, e.g. running-an-interview" } },
      required: ["name"],
    },
  },
};

/** Map the `tools:` allowlist in an agent's frontmatter onto our tool names. */
export function toolNamesFromAllowlist(allow: string[]): string[] {
  const names = new Set<string>(["list_directory", "load_skill"]);
  for (const t of allow) {
    switch (t.trim()) {
      case "Read":
        names.add("read_file");
        break;
      case "Write":
        names.add("write_file");
        break;
      case "Edit":
        names.add("edit_file");
        break;
      case "Grep":
        names.add("grep");
        break;
      case "Glob":
        names.add("glob");
        break;
      // Bash, Task, WebFetch etc. have no equivalent here
    }
  }
  return ["read_file", "list_directory", "glob", "grep", "load_skill", "write_file", "edit_file"].filter((n) => names.has(n));
}

export function storageTools(names: string[]): Anthropic.Tool[] {
  return names.map((n) => STORAGE_TOOL_DEFS[n]).filter(Boolean);
}

export function isStorageTool(name: string): boolean {
  return name in STORAGE_TOOL_DEFS;
}

export async function executeStorageTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case "read_file":
        return readFile(ctx, str(input.file_path), int(input.offset), int(input.limit));
      case "write_file":
        return await writeFile(ctx, str(input.file_path), str(input.content));
      case "edit_file":
        return await editFile(ctx, str(input.file_path), str(input.old_string), str(input.new_string), input.replace_all === true);
      case "list_directory":
        return listDirectory(ctx, str(input.path));
      case "glob":
        return globTool(ctx, str(input.pattern), str(input.path));
      case "grep":
        return grepTool(ctx, input);
      case "load_skill":
        return loadSkill(ctx, str(input.name));
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (e) {
    return { content: (e as Error).message, isError: true };
  }
}

function readFile(ctx: ToolContext, p: string, offset?: number, limit?: number): ToolResult {
  const path = normalizePath(p);
  if (hidden(path)) return { content: `Access denied: ${path} holds conversation state and is not readable by agents.`, isError: true };
  if (ctx.repo.isDir(path) && !ctx.repo.exists(path)) {
    return { content: `${path || "."} is a directory. Use list_directory. Contents:\n${ctx.repo.listDir(path).map((e) => (e.dir ? e.name + "/" : e.name)).join("\n")}`, isError: true };
  }
  if (ctx.repo.isBinary(path)) return { content: `${path} is a binary file and cannot be read as text.`, isError: true };
  const text = ctx.repo.read(path);
  if (text === undefined) return { content: `File does not exist: ${path}`, isError: true };
  ctx.readSet.add(path);
  if (text === "") return { content: "(empty file)" };
  return { content: numberedLines(text, offset ?? 1, limit ?? 2000) };
}

function checkWritable(ctx: ToolContext, path: string): string | null {
  if (!ctx.canWrite) return `The ${ctx.agent} agent is read-only and cannot write ${path}.`;
  if (hidden(path)) return `Access denied: ${path} is reserved for conversation state.`;
  if (path.startsWith("raw/") || path === "raw") return `raw/ is immutable: it is read, never edited. Write what you learned into wiki/ instead.`;
  if (!WRITABLE_PREFIXES.some((w) => path.startsWith(w))) return `Writes are limited to ${WRITABLE_PREFIXES.join(", ")}; refused: ${path}`;
  return null;
}

async function writeFile(ctx: ToolContext, p: string, content: string): Promise<ToolResult> {
  const path = normalizePath(p);
  const denied = checkWritable(ctx, path);
  if (denied) return { content: denied, isError: true };
  const exists = ctx.repo.exists(path);
  if (exists && !ctx.readSet.has(path)) return { content: `File has not been read yet. Read it first before writing to it: ${path}`, isError: true };
  const res = await ctx.repo.write(path, content, { message: `${ctx.commitPrefix} ${ctx.agent}: ${exists ? "update" : "create"} ${path}`, author: `cb/${ctx.agent}` });
  ctx.readSet.add(path);
  ctx.onCommit?.({ path, commit: res.commit, url: res.url, message: `${exists ? "update" : "create"} ${path}` });
  return { content: `${exists ? "Updated" : "Created"} ${path} (commit ${res.commit.slice(0, 7)})` };
}

async function editFile(ctx: ToolContext, p: string, oldStr: string, newStr: string, replaceAll: boolean): Promise<ToolResult> {
  const path = normalizePath(p);
  const denied = checkWritable(ctx, path);
  if (denied) return { content: denied, isError: true };
  const text = ctx.repo.read(path);
  if (text === undefined) return { content: `File does not exist: ${path}`, isError: true };
  if (!ctx.readSet.has(path)) return { content: `File has not been read yet. Read it first before editing it: ${path}`, isError: true };
  if (oldStr === "") return { content: "old_string must not be empty.", isError: true };
  if (oldStr === newStr) return { content: "No changes to make: old_string and new_string are exactly the same.", isError: true };
  const count = text.split(oldStr).length - 1;
  if (count === 0) return { content: `String to replace not found in file.\nString: ${oldStr}`, isError: true };
  if (count > 1 && !replaceAll) return { content: `Found ${count} matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.\nString: ${oldStr}`, isError: true };
  const updated = replaceAll ? text.split(oldStr).join(newStr) : text.replace(oldStr, () => newStr);
  const res = await ctx.repo.write(path, updated, { message: `${ctx.commitPrefix} ${ctx.agent}: edit ${path}`, author: `cb/${ctx.agent}` });
  ctx.onCommit?.({ path, commit: res.commit, url: res.url, message: `edit ${path}` });
  const line = text.slice(0, text.indexOf(oldStr)).split("\n").length;
  const snippet = updated.split("\n");
  const from = Math.max(1, line - 3);
  const preview = numberedLines(snippet.slice(from - 1, line - 1 + newStr.split("\n").length + 3).join("\n"), from);
  return { content: `The file ${path} has been updated (commit ${res.commit.slice(0, 7)}). Here's the result of running \`cat -n\` on a snippet of the edited file:\n${preview}` };
}

function listDirectory(ctx: ToolContext, p: string): ToolResult {
  const path = normalizePath(p === "." ? "" : p);
  if (hidden(path)) return { content: `Access denied: ${path}`, isError: true };
  if (path !== "" && !ctx.repo.isDir(path)) {
    if (ctx.repo.exists(path)) return { content: `${path} is a file, not a directory.`, isError: true };
    return { content: `Directory does not exist: ${path}`, isError: true };
  }
  const entries = ctx.repo.listDir(path).filter((e) => !(path === "" && hidden(e.name + "/")));
  if (!entries.length) return { content: `${path || "."}/ is empty` };
  return { content: `${path || "."}/\n` + entries.map((e) => `  ${e.name}${e.dir ? "/" : ""}`).join("\n") };
}

function globTool(ctx: ToolContext, pattern: string, base: string): ToolResult {
  if (!pattern) return { content: "pattern is required", isError: true };
  const dir = base ? normalizePath(base) : "";
  const hits = ctx.repo.glob(pattern, dir).filter((p) => !hidden(p));
  if (!hits.length) return { content: "No files found" };
  const shown = hits.slice(0, 500);
  return { content: shown.join("\n") + (hits.length > shown.length ? `\n[${hits.length - shown.length} more]` : "") };
}

function grepTool(ctx: ToolContext, input: Record<string, unknown>): ToolResult {
  const pattern = str(input.pattern);
  if (!pattern) return { content: "pattern is required", isError: true };
  const path = str(input.path);
  if (path && hidden(normalizePath(path))) return { content: `Access denied: ${path}`, isError: true };
  const c = int(input["-C"]);
  const out = ctx.repo.grep({
    pattern,
    path: path || undefined,
    glob: str(input.glob) || undefined,
    outputMode: (str(input.output_mode) || "files_with_matches") as "files_with_matches" | "content" | "count",
    ignoreCase: input["-i"] === true,
    lineNumbers: input["-n"] !== false,
    before: int(input["-B"]) ?? c,
    after: int(input["-A"]) ?? c,
    headLimit: int(input.head_limit),
    multiline: input.multiline === true,
  });
  // never leak state files through grep
  const filtered = out
    .split("\n")
    .filter((l) => !hidden(l))
    .join("\n");
  return { content: filtered };
}

function loadSkill(ctx: ToolContext, name: string): ToolResult {
  const n = name.trim().replace(/^\//, "");
  for (const [dir, standing] of [
    [".claude/skills", "trusted"],
    [".claude/skills-staging", "staging (unproven)"],
  ] as const) {
    const p = `${dir}/${n}/SKILL.md`;
    const text = ctx.repo.read(p);
    if (text !== undefined) {
      const extra = ctx.repo
        .glob(`${dir}/${n}/**`)
        .filter((f) => f !== p)
        .map((f) => `- ${f}`)
        .join("\n");
      return { content: `# Skill: ${n} (${standing}) — ${p}\n\n${text}${extra ? `\n\nOther files in this skill (read_file them if needed):\n${extra}` : ""}` };
    }
  }
  const available = [...ctx.repo.glob(".claude/skills/*/SKILL.md"), ...ctx.repo.glob(".claude/skills-staging/*/SKILL.md")].map((f) => f.split("/")[2]);
  return { content: `No skill named "${n}". Available: ${available.join(", ") || "none"}`, isError: true };
}

export { PathError };
