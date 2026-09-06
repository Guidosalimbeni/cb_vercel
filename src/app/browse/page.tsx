import Link from "next/link";
import { redirect } from "next/navigation";
import { marked } from "marked";
import { isAuthed } from "@/lib/auth";
import { getRepo } from "@/lib/server";
import { normalizePath } from "@/lib/repo";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

function crumbs(p: string) {
  const parts = p.split("/").filter(Boolean);
  const out: { label: string; href: string }[] = [{ label: "root", href: "/browse?path=" }];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    out.push({ label: part, href: `/browse?path=${encodeURIComponent(acc)}` });
  }
  return out;
}

function Notebook({ text }: { text: string }) {
  let nb: { cells?: { cell_type: string; source: string | string[]; outputs?: { output_type: string; text?: string | string[]; data?: Record<string, string | string[]> }[] }[] };
  try {
    nb = JSON.parse(text);
  } catch {
    return <pre>{text}</pre>;
  }
  const join = (s: string | string[] | undefined) => (Array.isArray(s) ? s.join("") : (s ?? ""));
  return (
    <div>
      {(nb.cells ?? []).map((c, i) => (
        <div className="cell" key={i}>
          <div className="tag">{c.cell_type}</div>
          {c.cell_type === "markdown" ? <div className="md" style={{ padding: 8 }} dangerouslySetInnerHTML={{ __html: marked.parse(join(c.source)) as string }} /> : <pre>{join(c.source)}</pre>}
          {(c.outputs ?? []).map((o, j) => (
            <pre className="out" key={j}>{o.output_type === "stream" ? join(o.text) : join(o.data?.["text/plain"]) || `[${o.output_type}]`}</pre>
          ))}
        </div>
      ))}
    </div>
  );
}

export default async function Browse({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  if (!(await isAuthed())) redirect("/login");
  const sp = await searchParams;
  let p = "";
  try {
    p = normalizePath(sp.path ?? "");
  } catch {
    p = "";
  }
  const repo = await getRepo();
  const ghBase = !config.localRepo && config.github.repo ? `https://github.com/${config.github.repo}/blob/${config.github.branch}/` : null;

  if (repo.exists(p)) {
    const content = repo.read(p);
    const isMd = p.endsWith(".md");
    const isNb = p.endsWith(".ipynb");
    return (
      <div className="page">
        <div className="crumbs">{crumbs(p).map((c, i) => <span key={c.href}>{i ? " / " : ""}<Link href={c.href}>{c.label}</Link></span>)} {ghBase ? <> · <a href={ghBase + p} target="_blank" rel="noreferrer">on GitHub</a></> : null}</div>
        <div className="file">
          {content === undefined ? <p>(binary file)</p> : isMd ? <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(content) as string }} /> : isNb ? <Notebook text={content} /> : <pre>{content}</pre>}
        </div>
        {isMd && content ? <details style={{ marginTop: 12 }}><summary className="hint">raw markdown</summary><pre className="file">{content}</pre></details> : null}
      </div>
    );
  }

  const entries = repo.isDir(p) ? repo.listDir(p) : [];
  const tops = ["wiki", "wiki/concepts", "wiki/questions", "wiki/events", "wiki/experiments", "wiki/methods", "wiki/literature", "wiki/traps", "wiki/tables", "wiki/processes", ".claude/SKILLS.md", ".claude/skills", ".claude/skills-staging", ".claude/commands", ".claude/agents", "raw", ".cb/threads"];
  return (
    <div className="page">
      <div className="crumbs">{crumbs(p).map((c, i) => <span key={c.href}>{i ? " / " : ""}<Link href={c.href}>{c.label}</Link></span>)}</div>
      <div className="tree">
        <div>
          <h1>Jump to</h1>
          <ul>{tops.map((t) => <li key={t}><Link href={`/browse?path=${encodeURIComponent(t)}`}>{t}</Link></li>)}</ul>
        </div>
        <div>
          <h1>{p || "/"}</h1>
          {entries.length ? (
            <ul>{entries.map((e) => <li key={e.name}><Link href={`/browse?path=${encodeURIComponent(p ? `${p}/${e.name}` : e.name)}`}>{e.dir ? "📁 " : "📄 "}{e.name}{e.dir ? "/" : ""}</Link></li>)}</ul>
          ) : (
            <p className="hint">Nothing here{p ? ` at ${p}` : ""}.</p>
          )}
        </div>
      </div>
    </div>
  );
}
