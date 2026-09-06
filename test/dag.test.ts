import { test } from "node:test";
import assert from "node:assert/strict";
import { Repo } from "../src/lib/repo";
import { LocalStore } from "../src/lib/store";
import { buildDag, layoutDag, related } from "../src/lib/dag";

const scratch = "/tmp/claude-0/-home-user-cb-vercel/396ce8c6-c341-5848-aa27-2a731ee151d5/scratchpad/repo";

test("buildDag reads concept files into nodes and directed edges", async () => {
  const store = new LocalStore(process.cwd());
  const snap = await store.load();
  snap.files.set("wiki/concepts/churn_30d.md", `---
id: churn_30d
label: 30-day churn
observed: true
measured_at: post_treatment
graphs: [retention, pricing]
tags: [dag]
---

## Caused by
- [[price_change]] — repricing shifts cancellation. {by:guido on:2026-03-04}
- [[plan_settledness]] — settled customers rarely leave.

## Causes
- [[net_revenue]] {by:guido on:2026-03-04}

## Computed from
- [[cancellations_30d]], [[active_base]] — ratio.

Reads as a false zero under 30 days.

## Questions that turned on this
- [[q-0042]] — did the price change drive churn?
`);
  snap.files.set("wiki/concepts/price_change.md", `---
id: price_change
observed: true
measured_at: pre_treatment
graphs: [pricing]
tags: [dag]
---
## Causes
- [[churn_30d]] — same edge, declared from the other end. {by:guido on:2026-03-04}
`);
  snap.files.set("wiki/concepts/plan_settledness.md", `---
id: plan_settledness
observed: false
measured_at: pre_treatment
graphs: [pricing]
---
`);
  const dag = buildDag(new Repo(snap, store));
  const ids = dag.nodes.map((n) => n.id);
  assert.deepEqual(ids, ["active_base", "cancellations_30d", "churn_30d", "net_revenue", "plan_settledness", "price_change"]);
  const churn = dag.nodes.find((n) => n.id === "churn_30d")!;
  assert.equal(churn.label, "30-day churn");
  assert.equal(churn.observed, "true");
  assert.deepEqual(churn.graphs, ["retention", "pricing"]);
  assert.match(churn.description, /false zero/);
  assert.deepEqual(churn.questions, ["q-0042"]);
  assert.equal(dag.nodes.find((n) => n.id === "net_revenue")!.missing, true);
  assert.equal(dag.nodes.find((n) => n.id === "plan_settledness")!.observed, "false");

  const e = (from: string, to: string) => dag.edges.find((x) => x.from === from && x.to === to)!;
  assert.equal(e("price_change", "churn_30d").confirmed, true);
  assert.equal(e("price_change", "churn_30d").by, "guido");
  assert.equal(e("price_change", "churn_30d").declaredIn.length, 2, "declared from both ends, merged");
  assert.match(e("price_change", "churn_30d").reasoning, /repricing shifts cancellation/);
  assert.equal(e("plan_settledness", "churn_30d").confirmed, false);
  assert.equal(e("plan_settledness", "churn_30d").reasoning, "settled customers rarely leave.");
  assert.equal(e("cancellations_30d", "churn_30d").kind, "computed");
  assert.equal(e("active_base", "churn_30d").kind, "computed");
  assert.equal(e("churn_30d", "net_revenue").kind, "causal");
  assert.deepEqual(dag.graphs, ["pricing", "retention"]);
  assert.ok(dag.warnings.some((w) => w.includes("plan_settledness.md: missing tags")));
  assert.ok(dag.warnings.some((w) => w.includes("net_revenue is linked")));

  const l = layoutDag(ids, dag.edges);
  const layer = (id: string) => l.nodes.find((n) => n.id === id)!.layer;
  assert.ok(layer("price_change") < layer("churn_30d"));
  assert.ok(layer("churn_30d") < layer("net_revenue"));
  assert.equal(l.backEdges.length, 0);
  const r = related("churn_30d", dag.edges);
  assert.deepEqual([...r.up].sort(), ["active_base", "cancellations_30d", "plan_settledness", "price_change"]);
  assert.deepEqual([...r.down], ["net_revenue"]);
});

test("layout breaks a cycle instead of looping", () => {
  const l = layoutDag(["a", "b", "c"], [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }]);
  assert.equal(l.nodes.length, 3);
  assert.deepEqual(l.backEdges, ["c→a"]);
});

test("the sample scratch graph, if present, parses without cycles", async () => {
  const { existsSync } = await import("node:fs");
  if (!existsSync(scratch)) return;
  const store = new LocalStore(scratch);
  const dag = buildDag(new Repo(await store.load(), store));
  assert.ok(dag.nodes.length >= 6);
  assert.equal(layoutDag(dag.nodes.map((n) => n.id), dag.edges).backEdges.length, 0);
});
