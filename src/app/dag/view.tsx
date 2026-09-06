"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { layoutDag, nodeWidth, related, NODE_H, type Dag, type DagEdge, type DagNode } from "@/lib/dag";

/** Node fill by measured_at: the three validated dark categorical slots; unknown is neutral. */
const TIMING: Record<string, { color: string; tag: string; label: string }> = {
  pre_treatment: { color: "#3987e5", tag: "PRE", label: "measured before treatment" },
  post_treatment: { color: "#d95926", tag: "POST", label: "measured after treatment" },
  concurrent: { color: "#199e70", tag: "CONC", label: "measured concurrently" },
  unknown: { color: "#5b6274", tag: "?", label: "timing unknown" },
};
const timing = (m: string) => TIMING[m] ?? TIMING.unknown;

export function DagView() {
  const [dag, setDag] = useState<Dag | null>(null);
  const [err, setErr] = useState("");
  const [graph, setGraph] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ e: DagEdge; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({});
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ id: string | null; sx: number; sy: number; ox: number; oy: number } | null>(null);

  const load = (fresh = false) =>
    fetch(`/api/dag${fresh ? "?fresh=1" : ""}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        setDag(j);
      })
      .catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    if (!dag) return { nodes: [] as DagNode[], edges: [] as DagEdge[] };
    const inGraph = new Set(dag.nodes.filter((n) => graph === "all" || n.graphs.includes(graph)).map((n) => n.id));
    if (graph !== "all") {
      // pull in phantom nodes that a member links to
      for (const e of dag.edges) {
        if (inGraph.has(e.from) || inGraph.has(e.to)) {
          for (const id of [e.from, e.to]) {
            const n = dag.nodes.find((x) => x.id === id);
            if (n && n.missing) inGraph.add(id);
          }
        }
      }
    }
    return { nodes: dag.nodes.filter((n) => inGraph.has(n.id)), edges: dag.edges.filter((e) => inGraph.has(e.from) && inGraph.has(e.to)) };
  }, [dag, graph]);

  const layout = useMemo(() => {
    const l = layoutDag(shown.nodes.map((n) => n.id), shown.edges);
    const byId = new Map(shown.nodes.map((n) => [n.id, n]));
    for (const p of l.nodes) p.w = nodeWidth(byId.get(p.id)?.label ?? p.id);
    return l;
  }, [shown]);

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const p of layout.nodes) m.set(p.id, { x: drag[p.id]?.x ?? p.x, y: drag[p.id]?.y ?? p.y, w: p.w, h: p.h });
    return m;
  }, [layout, drag]);

  const rel = useMemo(() => (selected ? related(selected, shown.edges) : null), [selected, shown.edges]);
  const dim = (id: string) => !!selected && id !== selected && !rel!.up.has(id) && !rel!.down.has(id);
  const nodeById = (id: string) => shown.nodes.find((n) => n.id === id);
  const sel = selected ? nodeById(selected) : undefined;

  // pointer handling: drag a node, or pan the canvas
  const toSvg = (ev: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k };
  };
  const onDown = (ev: React.PointerEvent, id: string | null) => {
    const p = toSvg(ev);
    const cur = id ? pos.get(id)! : { x: view.x, y: view.y };
    dragging.current = { id, sx: p.x, sy: p.y, ox: id ? cur.x : view.x, oy: id ? cur.y : view.y };
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };
  const onMove = (ev: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    if (d.id) {
      const p = toSvg(ev);
      setDrag((s) => ({ ...s, [d.id!]: { x: d.ox + (p.x - d.sx), y: d.oy + (p.y - d.sy) } }));
    } else {
      setView((v) => ({ ...v, x: d.ox + ev.movementX + (v.x - d.ox), y: d.oy + ev.movementY + (v.y - d.oy) }));
      d.ox = view.x;
      d.oy = view.y;
    }
  };
  const onUp = () => {
    dragging.current = null;
  };
  const onWheel = (ev: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const mx = ev.clientX - r.left;
    const my = ev.clientY - r.top;
    const k = Math.min(3, Math.max(0.3, view.k * (ev.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }));
  };

  const edgePath = (e: DagEdge) => {
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  if (err) return <div className="page"><div className="item error">{err}</div></div>;
  if (!dag) return <div className="page hint">Loading the graph…</div>;

  const confirmedCount = shown.edges.filter((e) => e.confirmed).length;

  return (
    <div className="dag-layout">
      <div className="dag-toolbar row">
        <strong>Causal graph</strong>
        <span className="hint">{shown.nodes.length} nodes · {shown.edges.length} edges · {confirmedCount} confirmed</span>
        <select value={graph} onChange={(e) => { setGraph(e.target.value); setSelected(null); setDrag({}); }}>
          <option value="all">all graphs</option>
          {dag.graphs.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <button onClick={() => { setDrag({}); setView({ x: 0, y: 0, k: 1 }); }}>Reset layout</button>
        <button onClick={() => load(true)}>Refresh</button>
        <span style={{ flex: 1 }} />
        <span className="legend">
          {Object.entries(TIMING).map(([k, t]) => <span key={k}><i style={{ background: t.color }} /> {k}</span>)}
          <span><i className="hollow" /> unobserved</span>
          <span><svg width="26" height="10"><line x1="0" y1="5" x2="26" y2="5" className="e-confirmed" /></svg> confirmed</span>
          <span><svg width="26" height="10"><line x1="0" y1="5" x2="26" y2="5" className="e-unconfirmed" /></svg> unconfirmed</span>
          <span><svg width="26" height="10"><line x1="0" y1="5" x2="26" y2="5" className="e-computed" /></svg> arithmetic</span>
        </span>
      </div>
      <div className="dag-body">
        <div className="dag-canvas">
          {!shown.nodes.length ? (
            <div className="hint" style={{ padding: 24 }}>
              <p><strong>No concept files yet.</strong> The graph is drawn during interviews: run <code>/cb_ask</code> and the interviewer writes the first nodes into <code>wiki/concepts/</code>. They appear here as soon as they are committed.</p>
              {dag.warnings.length ? <ul>{dag.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
            </div>
          ) : (
            <svg ref={svgRef} className="dag-svg" onPointerDown={(e) => onDown(e, null)} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onWheel={onWheel}>
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8b93a7" /></marker>
                <marker id="arrow-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#e6e8ee" /></marker>
              </defs>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                {shown.edges.map((e) => {
                  const faded = dim(e.from) || dim(e.to);
                  const hi = selected && (e.from === selected || e.to === selected);
                  return (
                    <g key={`${e.from}->${e.to}:${e.kind}`} opacity={faded ? 0.15 : 1}>
                      <path d={edgePath(e)} className="e-hit" onPointerEnter={(ev) => setHoverEdge({ e, x: ev.clientX, y: ev.clientY })} onPointerLeave={() => setHoverEdge(null)} />
                      <path d={edgePath(e)} className={`e-line ${e.kind === "computed" ? "e-computed" : e.confirmed ? "e-confirmed" : "e-unconfirmed"} ${hi ? "e-hi" : ""}`} markerEnd={`url(#${hi ? "arrow-hi" : "arrow"})`} />
                    </g>
                  );
                })}
                {shown.nodes.map((n) => {
                  const p = pos.get(n.id)!;
                  const t = timing(n.measured_at);
                  const isSel = selected === n.id;
                  return (
                    <g key={n.id} transform={`translate(${p.x} ${p.y})`} opacity={dim(n.id) ? 0.25 : 1} className="dag-node"
                      onPointerDown={(ev) => { ev.stopPropagation(); onDown(ev, n.id); }}
                      onClick={(ev) => { ev.stopPropagation(); setSelected(isSel ? null : n.id); }}>
                      <rect width={p.w} height={p.h} rx="8" fill={n.observed === "false" || n.missing ? "#161a22" : t.color} stroke={isSel ? "#e6e8ee" : t.color} strokeWidth={isSel ? 3 : 2} strokeDasharray={n.observed === "false" ? "6 4" : n.missing ? "2 4" : undefined} />
                      <text x={p.w / 2} y={NODE_H / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill={n.observed === "false" || n.missing ? "#e6e8ee" : "#0b0d12"} fontSize="13" fontWeight={600}>{n.label}</text>
                      <text x={p.w - 6} y={11} textAnchor="end" fontSize="9" fill={n.observed === "false" || n.missing ? "#8b93a7" : "#0b0d12"} opacity={0.85}>{n.missing ? "no file" : t.tag}</text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
          {hoverEdge ? (
            <div className="dag-tip" style={{ left: hoverEdge.x + 12, top: hoverEdge.y + 12 }}>
              <div className="mono">{hoverEdge.e.from} → {hoverEdge.e.to}{hoverEdge.e.kind === "computed" ? " (arithmetic)" : ""}</div>
              <div>{hoverEdge.e.reasoning || <i>no reasoning recorded</i>}</div>
              <div className="hint">{hoverEdge.e.confirmed ? `confirmed by ${hoverEdge.e.by} on ${hoverEdge.e.on}` : "not confirmed by anyone yet"}</div>
            </div>
          ) : null}
        </div>
        <aside className="dag-side">
          {sel ? (
            <div>
              <h2 style={{ margin: "0 0 4px" }}>{sel.label}</h2>
              <div className="mono hint">{sel.id}{sel.path ? <> · <a href={`/browse?path=${encodeURIComponent(sel.path)}`} target="_blank" rel="noreferrer">open file</a></> : " · no file yet"}</div>
              <table className="kv">
                <tbody>
                  <tr><td>observed</td><td>{sel.observed}</td></tr>
                  <tr><td>measured_at</td><td>{sel.measured_at} <span className="hint">({timing(sel.measured_at).label})</span></td></tr>
                  <tr><td>graphs</td><td>{sel.graphs.join(", ") || "—"}</td></tr>
                  <tr><td>source</td><td>{sel.source || "—"}</td></tr>
                  <tr><td>confirmed</td><td>{sel.confirmed_by ? `${sel.confirmed_by} on ${sel.confirmed_on}` : "—"}</td></tr>
                </tbody>
              </table>
              {sel.description ? <p>{sel.description}</p> : null}
              <EdgeList title="Caused by" edges={shown.edges.filter((e) => e.to === sel.id && e.kind === "causal")} side="from" onPick={setSelected} />
              <EdgeList title="Causes" edges={shown.edges.filter((e) => e.from === sel.id && e.kind === "causal")} side="to" onPick={setSelected} />
              <EdgeList title="Computed from" edges={shown.edges.filter((e) => e.to === sel.id && e.kind === "computed")} side="from" onPick={setSelected} />
              {rel ? <p className="hint">{rel.up.size} ancestors · {rel.down.size} descendants highlighted</p> : null}
              {sel.questions.length ? <p className="hint">Questions: {sel.questions.map((q) => <a key={q} href={`/browse?path=${encodeURIComponent(`wiki/questions/${q}/${q}.md`)}`} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>{q}</a>)}</p> : null}
            </div>
          ) : (
            <div className="hint">
              <p><strong>Click a node</strong> to see its fields, its edges with their reasoning, and to highlight its ancestors and descendants. Drag nodes to tidy the picture, scroll to zoom, drag the background to pan.</p>
              <p>Causes sit on the left, effects on the right. A dashed outline is a node marked <code>observed: false</code>, the material refusals are made of. A dashed edge has no <code>{"{by:... on:...}"}</code> span: nobody has confirmed it.</p>
              {dag.warnings.length ? <details><summary>{dag.warnings.length} warning{dag.warnings.length === 1 ? "" : "s"}</summary><ul>{dag.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details> : null}
              {layout.backEdges.length ? <p>Cycle detected through: {layout.backEdges.join(", ")}. A causal graph should not have one.</p> : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function EdgeList({ title, edges, side, onPick }: { title: string; edges: DagEdge[]; side: "from" | "to"; onPick: (id: string) => void }) {
  if (!edges.length) return null;
  return (
    <div>
      <h4 style={{ margin: "12px 0 4px" }}>{title}</h4>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {edges.map((e) => (
          <li key={`${e.from}-${e.to}`} style={{ marginBottom: 4 }}>
            <a href="#" onClick={(ev) => { ev.preventDefault(); onPick(e[side]); }} className="mono">{e[side]}</a>
            {e.reasoning ? <span> — {e.reasoning}</span> : null}
            <div className="hint">{e.confirmed ? `{by:${e.by} on:${e.on}}` : "unconfirmed"}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
