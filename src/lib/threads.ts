import type { MessageParam, PendingInput } from "./runner";
import type { Repo } from "./repo";
import { repairHistory } from "./runner";

/** One question for the analyst, shaped like Claude Code's AskUserQuestion. */
export interface AskQuestion {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multiSelect?: boolean;
}

export const THREAD_DIR = ".cb/threads";

export interface LogEvent {
  t: string;
  kind: "user" | "text" | "thinking" | "tool" | "agent_start" | "agent_end" | "commit" | "note" | "error" | "server_tool" | "ask";
  questions?: AskQuestion[];
  agent: string;
  text?: string;
  name?: string;
  input?: unknown;
  ok?: boolean;
  path?: string;
  commit?: string;
  url?: string;
  task?: string;
  status?: string;
}

export interface Thread {
  id: string;
  title: string;
  qid?: string;
  created: string;
  updated: string;
  awaiting: "analyst" | "continue" | "answer" | null;
  lastCommand?: string;
  /** a question the main agent asked through ask_analyst; the turn resumes when it is answered */
  pending?: PendingInput & { questions: AskQuestion[] };
  /** the main agent's last text of the last turn: what the analyst should read */
  final?: string;
  /** the main agent's conversation */
  main: MessageParam[];
  /** resumable subagent conversations, keyed by agent name */
  agents: Record<string, MessageParam[]>;
  /** files each agent has read on this thread (Write/Edit require a prior read) */
  reads: Record<string, string[]>;
  /** what the UI shows */
  log: LogEvent[];
  commits: number;
  usage: { input: number; output: number; cacheRead: number };
}

export interface ThreadSummary {
  id: string;
  title: string;
  qid?: string;
  created: string;
  updated: string;
  awaiting: Thread["awaiting"];
  lastCommand?: string;
  commits: number;
  final?: string;
  pending?: { questions: AskQuestion[] };
}

export function newThreadId(): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6);
  return `t-${stamp}-${rand}`;
}

export function newThread(title: string): Thread {
  const now = new Date().toISOString();
  return { id: newThreadId(), title, created: now, updated: now, awaiting: null, main: [], agents: {}, reads: {}, log: [], commits: 0, usage: { input: 0, output: 0, cacheRead: 0 } };
}

export function threadPath(id: string): string {
  return `${THREAD_DIR}/${id}.json`;
}

export function loadThread(repo: Repo, id: string): Thread | undefined {
  if (!/^t-[A-Za-z0-9-]+$/.test(id)) return undefined;
  const text = repo.read(threadPath(id));
  if (text === undefined) return undefined;
  const t = JSON.parse(text) as Thread;
  t.agents ??= {};
  t.reads ??= {};
  t.log ??= [];
  t.usage ??= { input: 0, output: 0, cacheRead: 0 };
  if (!t.pending && repairHistory(t.main)) t.log.push({ t: new Date().toISOString(), kind: "note", agent: "app", text: "A previous run was interrupted mid-tool; the history was repaired." });
  for (const m of Object.values(t.agents)) repairHistory(m);
  return t;
}

export function summarize(t: Thread): ThreadSummary {
  return { id: t.id, title: t.title, qid: t.qid, created: t.created, updated: t.updated, awaiting: t.awaiting, lastCommand: t.lastCommand, commits: t.commits, final: t.final, pending: t.pending ? { questions: t.pending.questions } : undefined };
}

export function listThreads(repo: Repo): ThreadSummary[] {
  const out: ThreadSummary[] = [];
  for (const p of repo.glob(`${THREAD_DIR}/*.json`)) {
    try {
      const t = JSON.parse(repo.read(p) ?? "") as Thread;
      out.push(summarize(t));
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => (a.updated < b.updated ? 1 : -1));
}

export async function saveThread(repo: Repo, t: Thread): Promise<void> {
  t.updated = new Date().toISOString();
  if (t.log.length > 600) t.log = t.log.slice(-600);
  await repo.write(threadPath(t.id), JSON.stringify(t, null, 1), { message: `[thread ${t.id}] state: ${t.title.slice(0, 60)}`, author: "cb/app" });
}
