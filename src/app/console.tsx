"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "./markdown";

interface CommandInfo { name: string; description: string; argumentHint: string }
interface AskQuestion { question: string; header?: string; options: { label: string; description?: string }[]; multiSelect?: boolean }
interface ThreadSummary { id: string; title: string; qid?: string; updated: string; awaiting: "analyst" | "continue" | "answer" | null; lastCommand?: string; commits: number; final?: string; pending?: { questions: AskQuestion[] } }

type Item =
  | { kind: "user"; text: string }
  | { kind: "text"; agent: string; text: string }
  | { kind: "thinking"; agent: string; text: string }
  | { kind: "tool"; agent: string; name: string; input?: unknown; result?: string; isError?: boolean }
  | { kind: "server_tool"; agent: string; name: string; text: string }
  | { kind: "agent_start"; agent: string; task: string; resume: boolean }
  | { kind: "agent_end"; agent: string; status: string; text: string }
  | { kind: "commit"; agent: string; path: string; commit: string; url?: string; text: string }
  | { kind: "ask"; questions: AskQuestion[] }
  | { kind: "note"; text: string }
  | { kind: "error"; text: string };

const AGENT_WORDS: Record<string, string> = {
  main: "assistant",
  interviewer: "interviewer",
  reviewer: "reviewer",
  scholar: "scholar",
  technician: "technician",
  librarian: "librarian",
};

function describeTool(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "read_file": return `reading ${i.file_path}`;
    case "write_file": return `writing ${i.file_path}`;
    case "edit_file": return `editing ${i.file_path}`;
    case "list_directory": return `listing ${i.path || "the repository"}`;
    case "glob": return `finding files ${i.pattern}`;
    case "grep": return `searching for "${i.pattern}"${i.path ? ` in ${i.path}` : ""}`;
    case "load_skill": return `loading the ${i.name} skill`;
    case "invoke_subagent": return `${i.resume ? "resuming" : "calling"} the ${i.agent}`;
    case "ask_analyst": return "asking you";
    default: return name;
  }
}

export function Console() {
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selected, setSelected] = useState<ThreadSummary | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"ask" | "ingest" | null>(null);
  const [askText, setAskText] = useState("");
  const [ingestName, setIngestName] = useState("");
  const [ingestText, setIngestText] = useState("");
  const [command, setCommand] = useState("cb_status");
  const [args, setArgs] = useState("");
  const [reply, setReply] = useState("");
  const [analyst, setAnalyst] = useState("");
  const [loadError, setLoadError] = useState("");
  const [liveText, setLiveText] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);
  const itemsRef = useRef<Item[]>([]);
  const activityRef = useRef<HTMLDivElement>(null);

  const setAll = (next: Item[]) => {
    itemsRef.current = next;
    setItems(next);
  };
  const push = (it: Item) => setAll([...itemsRef.current, it]);

  const refreshThreads = useCallback(async (fresh = false) => {
    const r = await fetch(`/api/threads${fresh ? "?fresh=1" : ""}`);
    const j = await r.json();
    if (r.ok) setThreads(j.threads);
    else setLoadError(j.error ?? r.statusText);
  }, []);

  useEffect(() => {
    try { setAnalyst(localStorage.getItem("cb_analyst") ?? ""); } catch { /* ignore */ }
    fetch("/api/commands").then(async (r) => {
      const j = await r.json();
      if (!r.ok) { setLoadError(j.error ?? r.statusText); return; }
      setCommands(j.commands);
    }).catch((e) => setLoadError(String(e)));
    refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    if (running) activityRef.current?.scrollTo({ top: activityRef.current.scrollHeight });
  }, [items, running]);

  const openThread = async (t: ThreadSummary) => {
    setMode(null);
    setSelected(t);
    setLiveText(t.final ?? "");
    setActivityOpen(false);
    const r = await fetch(`/api/threads?id=${encodeURIComponent(t.id)}&fresh=1`);
    const j = await r.json();
    if (!r.ok) { setAll([{ kind: "error", text: j.error }]); return; }
    setSelected(j.thread);
    setLiveText(j.thread.final ?? "");
    const out: Item[] = [];
    for (const e of j.log as Array<Record<string, unknown> & { kind: string; agent: string }>) {
      switch (e.kind) {
        case "user": out.push({ kind: "user", text: String(e.text ?? "") }); break;
        case "text": out.push({ kind: "text", agent: e.agent, text: String(e.text ?? "") }); break;
        case "tool": out.push({ kind: "tool", agent: e.agent, name: String(e.name), input: e.input, result: e.ok === false ? String(e.text ?? "") : "", isError: e.ok === false }); break;
        case "server_tool": out.push({ kind: "server_tool", agent: e.agent, name: String(e.name), text: String(e.text ?? "") }); break;
        case "agent_start": out.push({ kind: "agent_start", agent: e.agent, task: String(e.task ?? ""), resume: e.status === "resumed" }); break;
        case "agent_end": out.push({ kind: "agent_end", agent: e.agent, status: String(e.status ?? ""), text: String(e.text ?? "") }); break;
        case "commit": out.push({ kind: "commit", agent: e.agent, path: String(e.path), commit: String(e.commit ?? ""), url: e.url as string | undefined, text: String(e.text ?? "") }); break;
        case "ask": out.push({ kind: "ask", questions: (e.questions as AskQuestion[]) ?? [] }); break;
        case "note": out.push({ kind: "note", text: String(e.text ?? "") }); break;
        case "error": out.push({ kind: "error", text: String(e.text ?? "") }); break;
      }
    }
    setAll(out);
  };

  const startNew = (m: "ask" | "ingest") => { setSelected(null); setAll([]); setLiveText(""); setMode(m); };

  const run = async (body: Record<string, unknown>) => {
    if (running) return;
    setRunning(true);
    setMode(null);
    setActivityOpen(true);
    setLiveText("");
    try { localStorage.setItem("cb_analyst", analyst); } catch { /* ignore */ }
    const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, analyst: analyst || undefined }) });
    if (!res.ok || !res.body) {
      push({ kind: "error", text: `Request failed: ${res.status} ${await res.text()}` });
      setRunning(false);
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let mainText = "";
    const handle = (ev: Record<string, unknown> & { type: string }) => {
      const cur = itemsRef.current;
      const last = cur[cur.length - 1];
      switch (ev.type) {
        case "thread": setSelected(ev.thread as ThreadSummary); break;
        case "user": push({ kind: "user", text: String(ev.text) }); break;
        case "text":
          if (ev.agent === "main") {
            if (!(last && last.kind === "text" && last.agent === "main")) mainText = "";
            mainText += String(ev.delta);
            setLiveText(mainText);
          }
          if (last && last.kind === "text" && last.agent === ev.agent) setAll([...cur.slice(0, -1), { ...last, text: last.text + String(ev.delta) }]);
          else push({ kind: "text", agent: String(ev.agent), text: String(ev.delta) });
          break;
        case "thinking":
          if (last && last.kind === "thinking" && last.agent === ev.agent) setAll([...cur.slice(0, -1), { ...last, text: last.text + String(ev.delta) }]);
          else push({ kind: "thinking", agent: String(ev.agent), text: String(ev.delta) });
          break;
        case "tool_call": push({ kind: "tool", agent: String(ev.agent), name: String(ev.name), input: ev.input }); break;
        case "tool_result": {
          const idx = [...cur].reverse().findIndex((it) => it.kind === "tool" && it.name === ev.name && it.agent === ev.agent && it.result === undefined);
          if (idx >= 0) {
            const real = cur.length - 1 - idx;
            const it = cur[real] as Extract<Item, { kind: "tool" }>;
            setAll([...cur.slice(0, real), { ...it, result: String(ev.content), isError: !!ev.isError }, ...cur.slice(real + 1)]);
          }
          break;
        }
        case "server_tool": push({ kind: "server_tool", agent: String(ev.agent), name: String(ev.name), text: String(ev.summary) }); break;
        case "agent_start": push({ kind: "agent_start", agent: String(ev.agent), task: String(ev.task), resume: !!ev.resume }); break;
        case "agent_end": push({ kind: "agent_end", agent: String(ev.agent), status: String(ev.status), text: String(ev.text) }); break;
        case "commit": push({ kind: "commit", agent: String(ev.agent), path: String(ev.path), commit: String(ev.commit), url: ev.url as string | undefined, text: String(ev.message) }); break;
        case "ask": push({ kind: "ask", questions: ev.questions as AskQuestion[] }); break;
        case "error": push({ kind: "error", text: String(ev.message) }); break;
        case "done": {
          const awaiting = ev.awaiting as ThreadSummary["awaiting"];
          const questions = ev.questions as AskQuestion[] | undefined;
          setSelected((s) => (s ? { ...s, awaiting, qid: (ev.qid as string) ?? s.qid, final: String(ev.text ?? ""), pending: questions ? { questions } : undefined } : s));
          setLiveText(String(ev.text ?? "") || mainText);
          if (ev.status === "paused" || awaiting === "continue") push({ kind: "note", text: "Paused before finishing (time budget). Press Continue." });
          break;
        }
      }
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try { handle(JSON.parse(line.slice(6))); } catch (e) { push({ kind: "error", text: `bad event: ${String(e)}` }); }
          }
        }
      }
    } catch (e) {
      push({ kind: "error", text: `Connection ended: ${String(e)}` });
    }
    setRunning(false);
    setActivityOpen(false);
    refreshThreads(true);
  };

  const ingest = async () => {
    const name = ingestName.trim() || `pasted-${new Date().toISOString().slice(0, 10)}.md`;
    const path = `raw/${name}`;
    setRunning(true);
    const r = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, content: ingestText, analyst }) });
    const j = await r.json();
    setRunning(false);
    if (!r.ok) { setLoadError(`Upload failed: ${j.error}`); return; }
    setIngestText("");
    setIngestName("");
    await run({ command: "cb_ingest", args: path });
  };

  const cmd = commands.find((c) => c.name === command);
  const steps = items.filter((i) => i.kind !== "user").length;
  const status = running ? "working" : selected?.awaiting === "answer" ? "needs your answer" : selected?.awaiting === "continue" ? "paused" : selected ? "waiting for you" : "";

  return (
    <div className="app">
      <aside className="side">
        <div className="big-actions">
          <button className="big primary" onClick={() => startNew("ask")} disabled={running}>Ask a question</button>
          <button className="big" onClick={() => startNew("ingest")} disabled={running}>Ingest material</button>
        </div>
        <h3>Conversations</h3>
        <div className="threads">
          {threads.map((t) => (
            <div key={t.id} className={`thread ${selected?.id === t.id ? "active" : ""}`} onClick={() => openThread(t)}>
              <div className="title">{t.title.replace(/^\/cb_(ask|ingest|status|method|scholar|tech|outcome)\s*/, (m, c) => ({ ask: "", ingest: "Ingest: ", status: "Status", method: "Method: ", scholar: "Scholar: ", tech: "Plumbing: ", outcome: "Outcome: " })[c as string] ?? m)}</div>
              <div className="meta">
                {t.qid ? <span className="badge">{t.qid}</span> : null}
                {t.awaiting === "answer" ? <span className="badge wait">needs your answer</span> : t.awaiting === "continue" ? <span className="badge cont">paused</span> : <span className="badge">waiting for you</span>}
              </div>
            </div>
          ))}
          {!threads.length ? <div className="hint" style={{ padding: "8px 14px" }}>Nothing yet. Ask a question or ingest some material.</div> : null}
        </div>
        <details className="advanced">
          <summary>More actions</summary>
          <div className="stack">
            <select value={command} onChange={(e) => setCommand(e.target.value)} disabled={running}>
              {commands.map((c) => <option key={c.name} value={c.name}>/{c.name}</option>)}
            </select>
            {cmd ? <div className="hint">{cmd.description}</div> : null}
            <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder={cmd?.argumentHint || "(no argument)"} disabled={running} />
            <div className="row">
              <button disabled={running || !commands.length} onClick={() => run({ threadId: selected?.id, command, args })}>{selected ? "Run in this conversation" : "Run"}</button>
              {selected ? <button disabled={running} onClick={() => run({ command, args })}>Run as new</button> : null}
            </div>
            <label className="hint">Your name, for the wiki's {"{by:...}"} spans<br /><input value={analyst} onChange={(e) => setAnalyst(e.target.value)} placeholder="guido" /></label>
          </div>
        </details>
      </aside>

      <main className="main">
        {loadError ? <div className="card error">{loadError}</div> : null}

        {mode === "ask" ? (
          <section className="card">
            <h2>What do you want to know?</h2>
            <p className="hint">Ask it the way you would say it to a colleague. The assistant reads the wiki first, then interviews you about what only you know.</p>
            <textarea value={askText} onChange={(e) => setAskText(e.target.value)} placeholder="e.g. Did the March price change drive churn?" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && askText.trim()) run({ command: "cb_ask", args: askText.trim() }); }} />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="primary" disabled={!askText.trim() || running} onClick={() => run({ command: "cb_ask", args: askText.trim() })}>Ask</button>
            </div>
          </section>
        ) : null}

        {mode === "ingest" ? (
          <section className="card">
            <h2>Ingest material</h2>
            <p className="hint">Paste a document, a schema description, a process note, a past test write-up. It is stored under <code>raw/</code>, read into the wiki, and you get a summary of what was learned.</p>
            <input value={ingestName} onChange={(e) => setIngestName(e.target.value.trim())} placeholder="file name (optional), e.g. pricing-memo.md" style={{ width: "100%", marginBottom: 8 }} />
            <input type="file" accept=".md,.txt,.csv,.json,.yaml,.yml,.tsv" style={{ marginBottom: 8 }} onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!ingestName) setIngestName(f.name);
              f.text().then(setIngestText);
            }} />
            <textarea value={ingestText} onChange={(e) => setIngestText(e.target.value)} placeholder="…or paste the text here" style={{ minHeight: 220 }} />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="primary" disabled={!ingestText.trim() || running} onClick={ingest}>Ingest</button>
            </div>
          </section>
        ) : null}

        {selected || running ? (
          <>
            <header className="thread-head">
              <h2>{selected?.title.replace(/^\/cb_ask\s*/, "") ?? "…"}</h2>
              <span className={`badge ${running ? "run" : selected?.awaiting === "answer" ? "wait" : ""}`}>{status}</span>
            </header>

            <section className="card result">
              {running ? <div className="working"><span className="spinner" /> {steps ? lastStep(items) : "Starting…"}</div> : null}
              {liveText ? <Markdown text={liveText} /> : running ? null : <p className="hint">No result yet.</p>}
            </section>

            {!running && selected?.pending?.questions?.length ? (
              <QuestionForm questions={selected.pending.questions} onSubmit={(answers) => run({ threadId: selected.id, answers })} onFreeText={(text) => run({ threadId: selected.id, message: text })} />
            ) : null}

            {!running && selected && !selected.pending ? (
              <section className="card">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply, add detail, or paste a result…" style={{ minHeight: 70 }}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) { run({ threadId: selected.id, message: reply }); setReply(""); } }} />
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  {selected.awaiting === "continue" ? <button onClick={() => run({ threadId: selected.id })}>Continue</button> : null}
                  <button className="primary" disabled={!reply.trim()} onClick={() => { run({ threadId: selected.id, message: reply }); setReply(""); }}>Send</button>
                </div>
              </section>
            ) : null}

            <details className="activity" open={activityOpen} onToggle={(e) => setActivityOpen((e.target as HTMLDetailsElement).open)}>
              <summary>What happened behind the scenes · {steps} step{steps === 1 ? "" : "s"}</summary>
              <div className="activity-body" ref={activityRef}>
                {items.map((it, i) => <ItemView key={i} item={it} />)}
              </div>
            </details>
          </>
        ) : !mode ? (
          <section className="card welcome">
            <h2>A causal companion for this company</h2>
            <p>Two things accumulate here: a <a href="/browse?path=wiki">wiki</a> of what is true about the business, and a <a href="/dag">causal graph</a> drawn in conversation with you.</p>
            <p>Start with <strong>Ingest material</strong> to teach it something, or <strong>Ask a question</strong> to open an interview.</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function lastStep(items: Item[]): string {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "tool") return `${AGENT_WORDS[it.agent] ?? it.agent} is ${describeTool(it.name, it.input)}…`;
    if (it.kind === "agent_start") return `the ${it.agent} is working…`;
    if (it.kind === "agent_end") return `the ${it.agent} has finished`;
  }
  return "Thinking…";
}

function QuestionForm({ questions, onSubmit, onFreeText }: { questions: AskQuestion[]; onSubmit: (a: Record<string, string[]>) => void; onFreeText: (t: string) => void }) {
  const [picked, setPicked] = useState<Record<number, Set<string>>>({});
  const [other, setOther] = useState<Record<number, string>>({});
  const toggle = (qi: number, label: string, multi: boolean) => {
    setPicked((p) => {
      const cur = new Set(p[qi] ?? []);
      if (multi) { if (cur.has(label)) cur.delete(label); else cur.add(label); }
      else { cur.clear(); cur.add(label); }
      return { ...p, [qi]: cur };
    });
  };
  const complete = questions.every((q, i) => (picked[i]?.size ?? 0) > 0 || (other[i] ?? "").trim());
  const submit = () => {
    const answers: Record<string, string[]> = {};
    questions.forEach((q, i) => {
      const labels = [...(picked[i] ?? [])];
      const o = (other[i] ?? "").trim();
      answers[q.question] = o ? [...labels, `Other: ${o}`] : labels;
    });
    onSubmit(answers);
  };
  return (
    <section className="card question">
      {questions.map((q, qi) => (
        <div key={qi} className="q">
          {q.header ? <span className="chip">{q.header}</span> : null}
          <h3>{q.question}</h3>
          <div className="options">
            {q.options.map((o) => {
              const on = picked[qi]?.has(o.label);
              return (
                <button key={o.label} className={`option ${on ? "on" : ""}`} onClick={() => toggle(qi, o.label, !!q.multiSelect)}>
                  <span className="tick">{q.multiSelect ? (on ? "☑" : "☐") : on ? "◉" : "○"}</span>
                  <span><strong>{o.label}</strong>{o.description ? <span className="hint"> — {o.description}</span> : null}</span>
                </button>
              );
            })}
            <label className="option other">
              <span className="tick">✎</span>
              <input value={other[qi] ?? ""} onChange={(e) => setOther((s) => ({ ...s, [qi]: e.target.value }))} placeholder={q.multiSelect ? "Other (add your own)" : "Other (type your answer)"} />
            </label>
          </div>
          {q.multiSelect ? <div className="hint">Pick all that apply.</div> : null}
        </div>
      ))}
      <div className="row" style={{ justifyContent: "flex-end", gap: 12 }}>
        <span className="hint">Or just <a href="#" onClick={(e) => { e.preventDefault(); const t = prompt("Reply in your own words:"); if (t?.trim()) onFreeText(t.trim()); }}>reply in your own words</a></span>
        <button className="primary" disabled={!complete} onClick={submit}>Send answer{questions.length > 1 ? "s" : ""}</button>
      </div>
    </section>
  );
}

function ItemView({ item }: { item: Item }) {
  const who = "agent" in item ? (AGENT_WORDS[item.agent] ?? item.agent) : "";
  const sub = "agent" in item && item.agent !== "main" ? " sub" : "";
  switch (item.kind) {
    case "user": {
      const first = item.text.split("\n")[0];
      const rest = item.text.slice(first.length).trim();
      return (
        <div className="item user">
          <div className="who">you</div>
          <div>{first.replace(/^\[\/cb_(\w+)\s*(.*)\]$/, (_m, c, a) => `/${c} ${a}`)}</div>
          {rest ? <details><summary className="hint">full instructions</summary><pre className="hint">{rest}</pre></details> : null}
        </div>
      );
    }
    case "text": return <div className={`item text${sub}`}><div className="who">{who}</div><Markdown text={item.text} /></div>;
    case "thinking": return <div className={`item thinking${sub}`}><div className="who">{who} · thinking</div>{item.text}</div>;
    case "tool":
      return (
        <div className={`item tool${sub}${item.isError ? " err" : ""}`}>
          <span>{who} {describeTool(item.name, item.input)}</span>
          {item.result === undefined ? <span> …</span> : item.isError ? <details><summary>problem</summary><pre>{item.result}</pre></details> : item.name === "invoke_subagent" || !item.result ? null : <details><summary>see</summary><pre>{item.result}</pre></details>}
        </div>
      );
    case "server_tool": return <div className={`item tool${sub}`}><span>{who} ran code</span><pre>{item.text}</pre></div>;
    case "agent_start": return <div className="item agent"><div className="who">{item.agent} {item.resume ? "resumed" : "started"}</div><details><summary className="hint">brief</summary><pre>{item.task}</pre></details></div>;
    case "agent_end": return <div className="item agent_end sub"><div className="who">{item.agent} finished{item.status !== "done" ? ` (${item.status})` : ""}</div><Markdown text={item.text} /></div>;
    case "commit": return <div className={`item commit${sub}`}>✓ {who} saved <a href={`/browse?path=${encodeURIComponent(item.path)}`} target="_blank" rel="noreferrer">{item.path}</a>{item.url ? <> · <a href={item.url} target="_blank" rel="noreferrer">commit</a></> : null}</div>;
    case "ask": return <div className="item note">asked you: {item.questions.map((q) => q.question).join(" · ")}</div>;
    case "note": return <div className="item note">{item.text}</div>;
    case "error": return <div className="item error">{item.text}</div>;
  }
}
