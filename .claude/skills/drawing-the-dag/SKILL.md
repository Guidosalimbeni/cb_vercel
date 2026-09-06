---
name: drawing-the-dag
description: How to write causal structure into wiki/concepts — creating nodes, adding edges, marking observability and timing. Use during interviews whenever structure is being established.
---

# Drawing the graph

The graph is markdown files in `wiki/concepts/`, one per variable. It is the thing every
verdict is computed from, so it is worth getting the mechanics exactly right.

## Before you create a node, look for it

**Read `wiki/concepts/` and check whether this quantity already has one.** Match on
`label:` and the prose, not just the filename — the same variable arrives wearing a
different word every time somebody new asks about it. "Drop-off", "leavers", "attrition"
and `churn_30d` might be one node or four, and getting that wrong is the main way this
graph rots into something nobody trusts.

The test from `wiki/README.md` decides it: **same quantity, same grain, same timing** is
one concept. If any of the three differs they are two — `churn_30d` and `churn_90d` are
genuinely separate and can sit at opposite ends of the same edge.

If it exists, **extend it**: add the edge, add what was learned, add the backlink. Do not
create a near-duplicate because the existing node is named awkwardly; rename it if the
analyst agrees, or live with the name.

If it does not exist, create it — and say so in the conversation, so the analyst can
object to the name now rather than in a year when six things point at it.

## A node

```markdown
---
id: churn_30d
label: 30-day churn
observed: true
measured_at: post_treatment
graphs: [retention, pricing]
tags: [dag]
source: interview/2026-03-04
confirmed_by: guido
confirmed_on: 2026-03-04
---

## Caused by
- [[price_change]] — repricing shifts cancellation within the billing cycle. {by:guido on:2026-03-04}

## Causes
- [[net_revenue]] {by:guido on:2026-03-04}

## Computed from
- [[cancellations_30d]], [[active_base]] — ratio.

Prose. What this actually is. The gotcha nobody remembers.
```

The **heading carries direction and kind.** Obsidian's graph view is undirected and
untyped, so wikilinks alone are not enough — that is why the structure does the work.

## The three headings

`## Caused by` — incoming causal. `## Causes` — outgoing causal. Declare an edge from
either end; both are valid.

`## Computed from` — **arithmetic only.** `net_revenue = revenue × (1 − churn)` is
exactly true and carries zero causal content. It must never appear under a causal
heading, because a path running through arithmetic edges makes an accounting identity
look like a finding, and that error is invisible once it is in the graph.

## The three fields that matter most

**`measured_at`** — before or after the thing we are calling treatment. This is what
stops a mediator being used as a control. No semantic layer records it; it comes from
the analyst, in conversation, and it is the most valuable field in the wiki.

**`observed`** — `false` is a *claim*, and it needs a `source`. It is also the material
refusals are made of: an unobserved node on an unblockable backdoor path is exactly what
makes a question unanswerable, and naming it is what makes the refusal useful.

**`graphs`** — which named areas this belongs to. Membership lives in the node, never in
a separate manifest, so nothing can fall out of sync.

## The `{...}` span

`{by:guido on:2026-03-04}` after the reasoning. **No span means nobody has confirmed
this edge** — it is a proposal, and any verdict resting on it is provisional.

Visible rather than an HTML comment, deliberately: provenance you cannot see is
provenance nobody maintains, and a hidden marker breaks the moment someone hand-edits
the file in a text editor.

## Rules

**Every node gets `tags: [dag]`, and nothing else in the wiki does.** It exists for one
purpose: filtering the Obsidian graph view to `tag:#dag` so the causal graph can be seen
without the tables, events and question records on top of it. Do not invent further tags
— the headings already carry direction and kind.

**Adding an edge during an interview is fine.** The analyst is right there.

**Changing a confirmed edge means asking.** Reversing something confirmed last month is
a claim that the earlier judgement was wrong, and it may invalidate a past analysis.
Stop and say so.

**Deleting a node or edge always means asking.**

**The reasoning line is not decoration.** It is what a future session uses to decide
whether the edge still holds. "Because the billing cycle means a price change lands
within 30 days" survives; "obviously related" does not.

**One concept per causal variable, not per column.** If two columns in different tables
mean the same quantity at the same grain with the same timing, they are one concept with
two places it is stored. If any of those three differ, they are two concepts.
