import { parseFrontmatter, listValue } from "./frontmatter";
import type { Repo } from "./repo";

/** One causal variable: a file in wiki/concepts/. */
export interface DagNode {
  id: string;
  label: string;
  path?: string;
  /** referenced by a wikilink but no file exists yet */
  missing: boolean;
  observed: "true" | "false" | "unknown";
  measured_at: string;
  graphs: string[];
  source?: string;
  confirmed_by?: string;
  confirmed_on?: string;
  description: string;
  questions: string[];
}

export interface DagEdge {
  from: string;
  to: string;
  kind: "causal" | "computed";
  /** at least one declaration carried a {by:... on:...} span */
  confirmed: boolean;
  by?: string;
  on?: string;
  reasoning: string;
  /** which node file(s) declared it */
  declaredIn: string[];
}

export interface Dag {
  nodes: DagNode[];
  edges: DagEdge[];
  graphs: string[];
  warnings: string[];
}

const LINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
const SPAN = /\{by:\s*([^\s}]+)\s+on:\s*([^\s}]+)\s*\}/;

function sectionsOf(body: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current = "_intro";
  out.set(current, []);
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = h[1].toLowerCase();
      if (!out.has(current)) out.set(current, []);
      continue;
    }
    out.get(current)!.push(line);
  }
  return out;
}

function bullets(lines: string[] | undefined): string[] {
  if (!lines) return [];
  const out: string[] = [];
  for (const l of lines) {
    const m = l.match(/^\s*[-*]\s+(.*)$/);
    if (m) out.push(m[1]);
    else if (out.length && /^\s{2,}\S/.test(l)) out[out.length - 1] += " " + l.trim();
  }
  return out;
}

function slug(link: string): string {
  return link.trim().replace(/\.md$/, "").split("/").pop()!.trim();
}

/** Read every concept file and assemble the causal graph the wiki describes. */
export function buildDag(repo: Repo): Dag {
  const nodes = new Map<string, DagNode>();
  const edges = new Map<string, DagEdge>();
  const warnings: string[] = [];

  const ensure = (id: string): DagNode => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, label: id, missing: true, observed: "unknown", measured_at: "unknown", graphs: [], description: "", questions: [] };
      nodes.set(id, n);
    }
    return n;
  };

  const addEdge = (from: string, to: string, kind: DagEdge["kind"], text: string, declaredIn: string) => {
    if (from === to) {
      warnings.push(`${declaredIn}: self-edge on ${from} ignored`);
      return;
    }
    const span = text.match(SPAN);
    const reasoning = text
      .replace(LINK, "")
      .replace(SPAN, "")
      .replace(/^[\s—–\-:,]+|[\s—–\-:,]+$/g, "")
      .trim();
    const key = `${from}→${to}:${kind}`;
    const existing = edges.get(key);
    if (existing) {
      existing.declaredIn.push(declaredIn);
      if (span && !existing.confirmed) Object.assign(existing, { confirmed: true, by: span[1], on: span[2] });
      if (reasoning && !existing.reasoning.includes(reasoning)) existing.reasoning = existing.reasoning ? `${existing.reasoning} / ${reasoning}` : reasoning;
      return;
    }
    edges.set(key, { from, to, kind, confirmed: !!span, by: span?.[1], on: span?.[2], reasoning, declaredIn: [declaredIn] });
  };

  for (const path of repo.glob("wiki/concepts/*.md")) {
    const text = repo.read(path) ?? "";
    const { data, body } = parseFrontmatter(text);
    const id = (data.id || slug(path)).trim();
    const n = ensure(id);
    n.missing = false;
    n.path = path;
    n.label = data.label || id;
    n.observed = data.observed === "true" ? "true" : data.observed === "false" ? "false" : "unknown";
    n.measured_at = data.measured_at || "unknown";
    n.graphs = listValue(data.graphs);
    n.source = data.source;
    n.confirmed_by = data.confirmed_by;
    n.confirmed_on = data.confirmed_on;
    if (!listValue(data.tags).includes("dag")) warnings.push(`${path}: missing tags: [dag]`);

    const sec = sectionsOf(body);
    // prose lives wherever the author put it, often under the edge headings after the bullets
    const prose = [...sec.entries()]
      .filter(([k]) => !["questions that turned on this", "where it comes from"].includes(k))
      .flatMap(([, lines]) => lines)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("- ") && !l.startsWith("#"));
    n.description = prose.slice(0, 3).join(" ").slice(0, 400);
    n.questions = bullets(sec.get("questions that turned on this")).flatMap((b) => [...b.matchAll(LINK)].map((m) => slug(m[1])));

    for (const b of bullets(sec.get("caused by"))) for (const m of b.matchAll(LINK)) addEdge(slug(m[1]), id, "causal", b, path);
    for (const b of bullets(sec.get("causes"))) for (const m of b.matchAll(LINK)) addEdge(id, slug(m[1]), "causal", b, path);
    for (const b of bullets(sec.get("computed from"))) for (const m of b.matchAll(LINK)) addEdge(slug(m[1]), id, "computed", b, path);
  }

  for (const e of edges.values()) {
    ensure(e.from);
    ensure(e.to);
  }
  for (const n of nodes.values()) if (n.missing) warnings.push(`${n.id} is linked from the graph but has no file in wiki/concepts/`);

  const graphs = [...new Set([...nodes.values()].flatMap((n) => n.graphs))].sort();
  return { nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)), edges: [...edges.values()], graphs, warnings };
}

/* ------------------------------------------------------------- layout */

export interface Positioned {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
}

export interface Layout {
  nodes: Positioned[];
  width: number;
  height: number;
  /** edges dropped from layering to break cycles (still drawn) */
  backEdges: string[];
}

export const NODE_H = 44;
const X_GAP = 240;
const Y_GAP = 84;

export function nodeWidth(label: string): number {
  return Math.max(120, Math.min(260, 24 + label.length * 7.6));
}

/** Left-to-right layered layout: causes on the left, effects on the right. */
export function layoutDag(nodeIds: string[], edges: { from: string; to: string }[]): Layout {
  const ids = [...nodeIds];
  const idx = new Map(ids.map((id, i) => [id, i]));
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const inn = new Map<string, string[]>(ids.map((id) => [id, []]));
  const backEdges: string[] = [];

  // DFS to drop back edges so longest-path layering terminates
  const state = new Map<string, number>();
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) if (idx.has(e.from) && idx.has(e.to)) adj.get(e.from)!.push(e.to);
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of adj.get(u)!) {
      const s = state.get(v) ?? 0;
      if (s === 1) backEdges.push(`${u}→${v}`);
      else {
        out.get(u)!.push(v);
        inn.get(v)!.push(u);
        if (s === 0) visit(v);
      }
    }
    state.set(u, 2);
  };
  for (const id of ids) if (!state.get(id)) visit(id);

  const layer = new Map<string, number>();
  const depth = (u: string): number => {
    if (layer.has(u)) return layer.get(u)!;
    layer.set(u, 0);
    const d = inn.get(u)!.length ? Math.max(...inn.get(u)!.map((p) => depth(p) + 1)) : 0;
    layer.set(u, d);
    return d;
  };
  for (const id of ids) depth(id);

  const layers: string[][] = [];
  for (const id of ids) (layers[layer.get(id)!] ??= []).push(id);
  for (let i = 0; i < layers.length; i++) layers[i] ??= [];

  // barycenter ordering, a few sweeps each way
  const pos = new Map<string, number>();
  const reorder = (L: string[], neighbours: (id: string) => string[]) => {
    const bary = (id: string) => {
      const ns = neighbours(id).filter((n) => pos.has(n));
      return ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(id) ?? 0;
    };
    L.sort((a, b) => bary(a) - bary(b) || a.localeCompare(b));
    L.forEach((id, i) => pos.set(id, i));
  };
  layers.forEach((L) => L.forEach((id, i) => pos.set(id, i)));
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let i = 1; i < layers.length; i++) reorder(layers[i], (id) => inn.get(id)!);
    for (let i = layers.length - 2; i >= 0; i--) reorder(layers[i], (id) => out.get(id)!);
  }

  const tallest = Math.max(1, ...layers.map((L) => L.length));
  const height = tallest * Y_GAP + 40;
  const nodes: Positioned[] = [];
  layers.forEach((L, li) => {
    const offset = (height - L.length * Y_GAP) / 2;
    L.forEach((id, i) => {
      nodes.push({ id, x: 40 + li * X_GAP, y: offset + i * Y_GAP + (Y_GAP - NODE_H) / 2, w: 0, h: NODE_H, layer: li });
    });
  });
  return { nodes, width: 40 + layers.length * X_GAP, height, backEdges };
}

/** Ancestors and descendants of a node, for highlighting. */
export function related(id: string, edges: { from: string; to: string }[]): { up: Set<string>; down: Set<string> } {
  const walk = (start: string, dir: "from" | "to"): Set<string> => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const u = stack.pop()!;
      for (const e of edges) {
        const [a, b] = dir === "to" ? [e.from, e.to] : [e.to, e.from];
        if (a === u && !seen.has(b)) {
          seen.add(b);
          stack.push(b);
        }
      }
    }
    seen.delete(start);
    return seen;
  };
  return { up: walk(id, "from"), down: walk(id, "to") };
}
