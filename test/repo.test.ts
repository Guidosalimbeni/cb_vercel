import { test } from "node:test";
import assert from "node:assert/strict";
import { Repo, numberedLines } from "../src/lib/repo";
import { snapshotFromBuffers, type Store, type CommitInfo } from "../src/lib/store";
import { executeStorageTool, type ToolContext } from "../src/lib/tools";

class FakeStore implements Store {
  label = "fake";
  puts: { path: string; content: string; info: CommitInfo }[] = [];
  async load() {
    return snapshotFromBuffers([]);
  }
  async put(path: string, content: string, _prev: string | null, info: CommitInfo) {
    this.puts.push({ path, content, info });
    return { sha: "s", commit: "c".repeat(40) };
  }
  commitUrl() {
    return undefined;
  }
}

function makeRepo() {
  const store = new FakeStore();
  const snap = snapshotFromBuffers([
    ["wiki/README.md", Buffer.from("# The wiki\nRead this first.\n")],
    ["wiki/concepts/churn_30d.md", Buffer.from("---\nid: churn_30d\ntags: [dag]\n---\n## Caused by\n- [[price_change]] {by:guido on:2026-03-04}\n")],
    ["wiki/concepts/price_change.md", Buffer.from("---\nid: price_change\ntags: [dag]\n---\n## Causes\n- [[churn_30d]]\n")],
    ["raw/memo.md", Buffer.from("immutable\n")],
    [".cb/threads/t-1.json", Buffer.from('{"secret":true}')],
    ["img.png", Buffer.from([0x89, 0x50, 0, 0x47])],
  ]);
  return { repo: new Repo(snap, store), store };
}

function ctx(repo: Repo, agent = "main", canWrite = true): ToolContext {
  return { repo, agent, canWrite, readSet: new Set(), commitPrefix: "[test]" };
}

test("listDir, glob, grep", () => {
  const { repo } = makeRepo();
  assert.deepEqual(repo.listDir("wiki"), [
    { name: "concepts", dir: true },
    { name: "README.md", dir: false },
  ]);
  assert.deepEqual(repo.glob("wiki/concepts/*.md"), ["wiki/concepts/churn_30d.md", "wiki/concepts/price_change.md"]);
  assert.deepEqual(repo.glob("*.md", "wiki/concepts"), ["wiki/concepts/churn_30d.md", "wiki/concepts/price_change.md"]);
  assert.match(repo.grep({ pattern: "tags: \\[dag\\]", path: "wiki/concepts" }), /Found 2 files/);
  assert.equal(repo.grep({ pattern: "guido", outputMode: "content" }), "wiki/concepts/churn_30d.md:6:- [[price_change]] {by:guido on:2026-03-04}");
  assert.equal(repo.grep({ pattern: "nothing-here" }), "No matches found");
  assert.match(repo.grep({ pattern: "CHURN", ignoreCase: true, outputMode: "count" }), /churn_30d.md:\d/);
});

test("numberedLines mirrors cat -n", () => {
  assert.equal(numberedLines("a\nb"), "     1\ta\n     2\tb");
  assert.match(numberedLines("a\nb\nc", 2, 1), /^\s+2\tb\n\n\[1 more lines; use offset=3/);
});

test("read_file then edit_file commits with the agent as author", async () => {
  const { repo, store } = makeRepo();
  const c = ctx(repo, "interviewer");
  const blocked = await executeStorageTool("edit_file", { file_path: "wiki/README.md", old_string: "first", new_string: "FIRST" }, c);
  assert.equal(blocked.isError, true);
  assert.match(blocked.content, /has not been read yet/);
  const r = await executeStorageTool("read_file", { file_path: "wiki/README.md" }, c);
  assert.match(r.content, /1\t# The wiki/);
  const e = await executeStorageTool("edit_file", { file_path: "wiki/README.md", old_string: "first", new_string: "FIRST" }, c);
  assert.equal(e.isError, undefined, e.content);
  assert.equal(store.puts.length, 1);
  assert.equal(store.puts[0].info.author, "cb/interviewer");
  assert.match(store.puts[0].info.message, /^\[test\] interviewer: edit wiki\/README.md/);
  assert.equal(repo.read("wiki/README.md"), "# The wiki\nRead this FIRST.\n");
});

test("edit_file refuses ambiguous and missing matches", async () => {
  const { repo } = makeRepo();
  const c = ctx(repo);
  await executeStorageTool("read_file", { file_path: "wiki/concepts/churn_30d.md" }, c);
  const amb = await executeStorageTool("edit_file", { file_path: "wiki/concepts/churn_30d.md", old_string: "\n", new_string: "\r\n" }, c);
  assert.match(amb.content, /Found \d+ matches/);
  const miss = await executeStorageTool("edit_file", { file_path: "wiki/concepts/churn_30d.md", old_string: "zzz", new_string: "y" }, c);
  assert.match(miss.content, /not found/);
  const all = await executeStorageTool("edit_file", { file_path: "wiki/concepts/churn_30d.md", old_string: "dag", new_string: "DAG", replace_all: true }, c);
  assert.equal(all.isError, undefined);
});

test("write_file creates, refuses raw/, .cb/, and read-only agents", async () => {
  const { repo, store } = makeRepo();
  const c = ctx(repo, "librarian");
  const ok = await executeStorageTool("write_file", { file_path: "wiki/traps/new.md", content: "x" }, c);
  assert.match(ok.content, /Created wiki\/traps\/new.md/);
  assert.equal(store.puts[0].info.message, "[test] librarian: create wiki/traps/new.md");
  const raw = await executeStorageTool("write_file", { file_path: "raw/memo.md", content: "x" }, c);
  assert.match(raw.content, /immutable/);
  const cb = await executeStorageTool("write_file", { file_path: ".cb/threads/t-1.json", content: "x" }, c);
  assert.equal(cb.isError, true);
  const ro = await executeStorageTool("write_file", { file_path: "wiki/x.md", content: "x" }, ctx(repo, "reviewer", false));
  assert.match(ro.content, /read-only/);
  const overwrite = await executeStorageTool("write_file", { file_path: "wiki/README.md", content: "x" }, c);
  assert.match(overwrite.content, /has not been read yet/);
});

test("conversation state is invisible to every agent", async () => {
  const { repo } = makeRepo();
  const c = ctx(repo, "reviewer", false);
  assert.equal((await executeStorageTool("read_file", { file_path: ".cb/threads/t-1.json" }, c)).isError, true);
  assert.doesNotMatch((await executeStorageTool("grep", { pattern: "secret" }, c)).content, /t-1/);
  assert.equal((await executeStorageTool("glob", { pattern: ".cb/**" }, c)).content, "No files found");
  assert.doesNotMatch((await executeStorageTool("list_directory", { path: "" }, c)).content, /\.cb/);
});

test("read_file on a directory and a binary explains itself", async () => {
  const { repo } = makeRepo();
  const c = ctx(repo);
  assert.match((await executeStorageTool("read_file", { file_path: "wiki" }, c)).content, /is a directory/);
  assert.match((await executeStorageTool("read_file", { file_path: "img.png" }, c)).content, /binary/);
  assert.match((await executeStorageTool("read_file", { file_path: "../etc/passwd" }, c)).content, /escapes/);
});
