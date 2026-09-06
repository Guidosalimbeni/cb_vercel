"use client";
import { useState } from "react";

export function UploadForm() {
  const [dest, setDest] = useState<"raw" | "data" | "result">("raw");
  const [qid, setQid] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const path = dest === "raw" ? `raw/${name}` : `wiki/questions/${qid}/${dest}/${name}`;

  const submit = async () => {
    setBusy(true);
    setMsg("");
    let analyst = "";
    try { analyst = localStorage.getItem("cb_analyst") ?? ""; } catch { /* ignore */ }
    const r = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, content, analyst }) });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? `Committed ${j.path} (${String(j.commit).slice(0, 7)}). ${dest === "raw" ? "Now run /cb_ingest." : dest === "result" ? "Now run /cb_result with the path." : "Referenced by relative path from the notebook."}` : `Error: ${j.error}`);
  };

  return (
    <div className="page" style={{ maxWidth: 800 }}>
      <h1>Upload material</h1>
      <p className="hint">Text only for this demo: markdown, CSV, JSON, an executed .ipynb. Paste it or pick a file. It is committed to the content repo as you.</p>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={dest} onChange={(e) => setDest(e.target.value as "raw" | "data" | "result")}>
          <option value="raw">raw/ — source material for /cb_ingest</option>
          <option value="data">wiki/questions/&lt;qid&gt;/data/ — a sample extract</option>
          <option value="result">wiki/questions/&lt;qid&gt;/result/ — an executed notebook or its output</option>
        </select>
        {dest !== "raw" ? <input value={qid} onChange={(e) => setQid(e.target.value.trim())} placeholder="q-0001" style={{ width: 100 }} /> : null}
        <input value={name} onChange={(e) => setName(e.target.value.trim())} placeholder="filename, e.g. 2026-09-pricing-memo.md" className="grow" />
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input type="file" accept=".md,.txt,.csv,.json,.ipynb,.yaml,.yml,.tsv,.py,.sql" onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (!name) setName(f.name);
          f.text().then(setContent);
        }} />
      </div>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} style={{ minHeight: 260 }} placeholder="…or paste the text here" />
      <div className="row" style={{ marginTop: 8 }}>
        <span className="mono hint">{path}</span>
        <span style={{ flex: 1 }} />
        <button className="primary" disabled={busy || !name || !content || (dest !== "raw" && !/^q-\d{4}$/.test(qid))} onClick={submit}>Commit</button>
      </div>
      {msg ? <p className={msg.startsWith("Error") ? "" : "hint"} style={msg.startsWith("Error") ? { color: "var(--red)" } : {}}>{msg}</p> : null}
    </div>
  );
}
