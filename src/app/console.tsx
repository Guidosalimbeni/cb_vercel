"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "./markdown";

interface CommandInfo { name: string; description: string; argumentHint: string }
interface AgentInfo { name: string; description: string; tools: string[] }
interface ThreadSummary { id: string; title: string; qid?: string; updated: string; awaiting: "analyst" | "continue" | null; lastCommand?: string; commits: number }

type Item =
  | { kind: "user"; text: string }
  | { kind: "text"; agent: string; text: string }
  | { kind: "thinking"; agent: string; text: string }
  | { kind: "tool"; agent: string; name: string; input?: unknown; result?: string; isError?: boolean }
  | { kind: "server_tool"; agent: string; name: string; text: string }
  | { kind: "agent_start"; agent: string; task: string; resume: boolean }
  | { kind: "agent_end"; agent: string; status: string; text: string }
  | { kind: "commit"; agent: string; path: string; commit: string; url?: string; text: string }
  | { kind: "note"; text: string }
  | { kind: "error"; text: string };

function summarizeInput(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "read_file": return String(i.file_path ?? "");
    case "write_file": return `${i.file_path} (${String(i.content ?? "").length} chars)`;
    case "edit_file": return `${i.file_path}${i.replace_all ? " (all)" : ""}`;
    case "list_directory": return String(i.path ?? ".");
    case "glob": return `${i.pattern}${i.path ? " in " + i.path : ""}`;
    case "grep": return `/${i.pattern}/${i["-i"] ? "i" : ""}${i.path ? " in " + i.path : ""}${i.glob ? " glob " + i.glob : ""}${i.output_mode ? " (" + i.output_mode + ")" : ""}`;
    case "load_skill": return String(i.name ?? "");
    case "invoke_subagent": return `${i.agent}${i.resume ? " (resume)" : ""}`;
    default: return JSON.stringify(i).slice(0, 120);
  }
}

export function Console() {
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [store, setStore] = useState("");
  const [selected, setSelected] = useState<ThreadSummary | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [command, setCommand] = useState("cb_ask");
  const [args, setArgs] = useState("");
  const [reply, setReply] = useState("");
  const [analyst, setAnalyst] = useState("");
  const [usage, setUsage] = useState({ input: 0, output: 0, cacheRead: 0 });
  const [loadError, setLoadError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Item[]>([]);

  const setAll = (next: Item[]) => {
    itemsRef.current = next;
    setItems(next);
  };
  const push = (it: Item) => setAll([...itemsRef.current, it]);

  useEffect(() => {
    try {
      setAnalyst(localStorage.getItem("cb_analyst") ?? "");
    } catch { /* ignore */ }
    fetch("/api/commands").then(async (r) => {
      const j = await r.json();
      if (!r.ok) { setLoadError(j.error ?? r.statusText); return; }
      setCommands(j.commands); setAgents(j.agents); setStore(j.store);
    }).catch((e) => setLoadError(String(e)));
    refreshThreads();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items]);

  const refreshThreads = useCallback(async (fresh = false) => {
    const r = await fetch(`/api/threads${fresh ? "?fresh=1" : ""}`);
    const j = await r.json();
    if (r.ok) setThreads(j.threads);
    else setLoadError(j.error ?? r.statusText);
  }, []);

  const openThread = async (t: ThreadSummary) => {
    setSelected(t);
    const r = await fetch(`/api/threads?id=${encodeURIComponent(t.id)}&fresh=1`);
    const j = await r.json();
    if (!r.ok) { setAll([{ kind: "error", text: j.error }]); return; }
    setUsage(j.usage ?? { input: 0, output: 0, cacheRead: 0 });
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
        case "note": out.push({ kind: "note", text: String(e.text ?? "") }); break;
        case "error": out.push({ kind: "error", text: String(e.text ?? "") }); break;
      }
    }
    setAll(out);
  };

  const newThread = () => { setSelected(null); setAll([]); setUsage({ input: 0, output: 0, cacheRead: 0 }); };

  const run = async (body: Record<string, unknown>) => {
    if (running) return;
    setRunning(true);
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
    const handle = (ev: Record<string, unknown> & { type: string }) => {
      const cur = itemsRef.current;
      const last = cur[cur.length - 1];
      switch (ev.type) {
        case "thread": setSelected(ev.thread as ThreadSummary); break;
        case "user": push({ kind: "user", text: String(ev.text) }); break;
        case "text":
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
        case "usage": setUsage((u) => ({ input: u.input + Number(ev.input), output: u.output + Number(ev.output), cacheRead: u.cacheRead + Number(ev.cacheRead) })); break;
        case "error": push({ kind: "error", text: String(ev.message) }); break;
        case "done": {
          const status = String(ev.status);
          const awaiting = ev.awaiting as ThreadSummary["awaiting"];
          push({ kind: "note", text: status === "paused" || awaiting === "continue" ? "Paused (time budget or interruption). Press Continue to let it carry on." : status === "max_rounds" ? "Stopped at the tool-call limit. Press Continue." : "Turn finished. Waiting for you." });
          setSelected((s) => (s ? { ...s, awaiting, qid: (ev.qid as string) ?? s.qid } : s));
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
      push({ kind: "error", text: `Stream ended: ${String(e)}` });
    }
    setRunning(false);
    refreshThreads(true);
  };

  const cmd = commands.find((c) => c.name === command);
  const canContinue = !!selected && selected.awaiting === "continue";

  return (
    <div className="layout">
      <div className="col">
        <h3>Threads <button style={{ float: "right", padding: "0 8px", fontSize: 11 }} onClick={newThread}>+ new</button></h3>
        {threads.map((t) => (
          <div key={t.id} className={`thread ${selected?.id === t.id ? "active" : ""}`} onClick={() => openThread(t)}>
            <div className="title">{t.title}</div>
            <div className="meta">
              {t.qid ? <span className="badge">{t.qid}</span> : null}
              {t.awaiting === "continue" ? <span className="badge cont">paused</span> : <span className="badge wait">waiting for you</span>}
              <span>{t.lastCommand ? "/" + t.lastCommand : ""}</span>
              <span>{t.commits} commits</span>
            </div>
          </div>
        ))}
        {!threads.length ? <div className="hint" style={{ padding: 12 }}>No threads yet. Pick a command on the right and run it.</div> : null}
      </div>

      <div className="col center">
        <div className="stats">
          {store ? <span className="mono">{store}</span> : null}
          {selected ? <span> · {selected.title}</span> : <span> · new thread</span>}
          <span> · tokens in {usage.input.toLocaleString()} (cached {usage.cacheRead.toLocaleString()}) · out {usage.output.toLocaleString()}</span>
        </div>
        <div className="scroll" ref={scrollRef}>
          <div className="transcript">
            {loadError ? <div className="item error">{loadError}</div> : null}
            {!items.length && !loadError ? (
              <div className="hint">
                <p>This is the terminal. Run a slash command with an argument, watch the main agent read the wiki, invoke subagents, and commit files. When it stops, it is waiting for you: reply below.</p>
              </div>
            ) : null}
            {items.map((it, i) => <ItemView key={i} item={it} />)}
            {running ? <div className="item note"><span className="badge run">running</span></div> : null}
          </div>
        </div>
        <div className="composer">
          <div className="row">
            <select value={command} onChange={(e) => setCommand(e.target.value)} disabled={running}>
              {commands.map((c) => <option key={c.name} value={c.name}>/{c.name}</option>)}
            </select>
            <input className="grow" value={args} onChange={(e) => setArgs(e.target.value)} placeholder={cmd?.argumentHint || "(no argument)"} disabled={running}
              onKeyDown={(e) => { if (e.key === "Enter" && !running) run({ threadId: selected?.id, command, args }); }} />
            <button className="primary" disabled={running || !commands.length} onClick={() => run({ threadId: selected?.id, command, args })}>Run {selected ? "in thread" : "new thread"}</button>
          </div>
          {cmd ? <div className="hint">{cmd.description}</div> : null}
          <div className="row">
            <textarea className="grow" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={selected ? "Reply to the agent (interview answers, 'proceed', 'park it', a pasted result...)" : "Or start a thread with a plain message"} disabled={running}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim() && !running) { run({ threadId: selected?.id, message: reply }); setReply(""); } }} />
          </div>
          <div className="row">
            <button disabled={running || !reply.trim()} onClick={() => { run({ threadId: selected?.id, message: reply }); setReply(""); }}>Send reply</button>
            {canContinue ? <button disabled={running} onClick={() => run({ threadId: selected!.id })}>Continue</button> : null}
            <span className="spacer" style={{ flex: 1 }} />
            <label className="hint">your name for {"{by:...}"} spans <input value={analyst} onChange={(e) => setAnalyst(e.target.value)} placeholder="guido" style={{ width: 110 }} /></label>
          </div>
        </div>
      </div>

      <div className="col">
        <h3>Commands</h3>
        {commands.map((c) => (
          <div key={c.name} className={`cmd ${c.name === command ? "active" : ""}`} onClick={() => setCommand(c.name)}>
            <div className="name mono">/{c.name} <span className="hint">{c.argumentHint}</span></div>
            <div className="desc">{c.description}</div>
          </div>
        ))}
        <h3>Agents</h3>
        {agents.map((a) => (
          <div key={a.name} className="cmd" style={{ cursor: "default" }}>
            <div className="name mono" style={{ color: "var(--purple)" }}>{a.name} <span className="hint">{a.tools.join(", ")}</span></div>
            <div className="desc">{a.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Who({ agent, extra }: { agent: string; extra?: React.ReactNode }) {
  return <div className="who"><span className={agent === "main" ? "agent-main" : "agent-sub"}>{agent}</span>{extra}</div>;
}

function ItemView({ item }: { item: Item }) {
  const sub = "agent" in item && item.agent !== "main" ? " sub" : "";
  switch (item.kind) {
    case "user": {
      const first = item.text.split("\n")[0];
      const rest = item.text.slice(first.length).trim();
      return (
        <div className="item user">
          <div className="who">you</div>
          <div className="mono">{first}</div>
          {rest ? <details><summary className="hint">command prompt</summary><pre className="hint">{rest}</pre></details> : null}
        </div>
      );
    }
    case "text": return <div className={`item text${sub}`}><Who agent={item.agent} /><Markdown text={item.text} /></div>;
    case "thinking": return <div className={`item thinking${sub}`}><Who agent={item.agent} extra={<span>thinking</span>} />{item.text}</div>;
    case "tool":
      return (
        <div className={`item tool${sub}${item.isError ? " err" : ""}`}>
          <span className="mono">{item.agent !== "main" ? `${item.agent} › ` : ""}{item.name}</span> <span>{summarizeInput(item.name, item.input)}</span>
          {item.result === undefined ? <span> …</span> : item.isError ? <details><summary>error</summary><pre>{item.result}</pre></details> : item.name === "invoke_subagent" || !item.result ? null : <details><summary>result</summary><pre>{item.result}</pre></details>}
        </div>
      );
    case "server_tool": return <div className={`item tool${sub}`}><span className="mono">{item.name}</span> <pre>{item.text}</pre></div>;
    case "agent_start":
      return (
        <div className="item agent">
          <Who agent={item.agent} extra={<span>{item.resume ? "resumed" : "started"}</span>} />
          <details><summary className="hint">task</summary><pre>{item.task}</pre></details>
        </div>
      );
    case "agent_end":
      return (
        <div className="item agent_end sub">
          <Who agent={item.agent} extra={<span>finished · {item.status}</span>} />
          <Markdown text={item.text} />
        </div>
      );
    case "commit":
      return (
        <div className={`item commit${sub}`}>
          ✓ <span className="mono">{item.agent}</span> committed <span className="mono">{item.path}</span> {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.commit.slice(0, 7)}</a> : <span className="mono">{item.commit.slice(0, 7)}</span>} <a href={`/browse?path=${encodeURIComponent(item.path)}`} target="_blank" rel="noreferrer">view</a>
        </div>
      );
    case "note": return <div className="item note">{item.text}</div>;
    case "error": return <div className="item error">{item.text}</div>;
  }
}
