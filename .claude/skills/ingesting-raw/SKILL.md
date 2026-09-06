---
name: ingesting-raw
description: Read new material from raw/ into the wiki — schema exports, semantic layers, process notes, release notes, past experiment write-ups. Use when the analyst runs /ingest or drops files in raw/.
---

# Ingesting raw material

`raw/` is **immutable**. Read it, never edit or delete it. Everything written from it
cites the file it came from.

## The one rule

**Facts about what a thing *is* go straight into the wiki. Claims about what *causes*
what do not.**

A schema export tells you a column exists, its type, its description. Write it. A
process note says the contact centre escalates after two failed payments. Write it. A
document asserting that price drives churn is a *causal claim* — record it as an
attributed claim in prose ("the 2025 pricing review argued that…"), never as an edge in
`wiki/concepts/`.

Edges are drawn in interviews, where the analyst is present to confirm them. That is
not bureaucracy: a document is one person's model of the business, and importing it
silently is how the graph fills with claims nobody agreed to.

## Where things go

| Material | Destination |
|---|---|
| Schema export, semantic layer, data dictionary | `wiki/tables/<system>.<schema>.<table>.md` |
| Process description, how-it-works notes | `wiki/processes/<slug>.md` |
| Release note, migration note, policy change, anything dated | `wiki/events/<date>-<slug>.md` |
| Past test results, holdouts, readouts | `wiki/experiments/<slug>.md` |
| A causal claim in prose | Attributed prose on the relevant table or process page |
| Sample data | Value examples on the table page — see privacy below |

## External material is different

Library documentation, a paper, a blog post from another company, a conference talk —
material about the *field* rather than about this company. It goes to
`wiki/literature/<slug>.md`. Never to `concepts/`, `tables/` or `processes/`.

**The one rule inverts here.** Company material is mostly facts with the occasional
causal claim to quarantine. External material is *entirely* claims, and the job is not
to extract facts from it but to record exactly what is being claimed, what it assumes,
and how far to trust it. A paper's finding is a fact about the paper.

Three things a summary will lose and the page needs:

- **The claim, stated precisely enough to be wrong.** "Uplift modelling improves
  targeting" is unusable. "Two-model uplift estimation is unbiased for CATE under
  randomised assignment and biased under self-selection" can be checked.
- **What it does not cover.** The boundary is what stops it being over-applied.
- **A trust level with a reason.** A vendor blog arguing for the vendor's own method is
  `low` however well written. Official docs *for the version we run* are `high`; docs
  for a different major version are not.

Keep the original in `raw/` and link it from the page. Never paraphrase a paper into the
wiki and lose the PDF.

**Do not import a paper's DAG into `wiki/concepts/`.** It is a claim about somebody
else's business, and it belongs in prose on the literature page like any other claim.

## Tables

Merge into an existing table page rather than replacing it. **Never delete a column
that has vanished upstream** — mark it retired. The note that someone recorded it as
post-treatment outlives the column, and columns come back.

Preserve every human annotation. A regenerated table page that loses the `measured_at`
column has destroyed the most valuable thing in the file.

## Events are the highest-value thing here

Release notes, migration announcements, policy changes, repricing memos. Each is either
a natural experiment or an unmeasured confounder, depending only on whether it was
written down. Record every dateable change you find, even if no question needs it now.

Get the boundary: **who it applied to and who it did not.** That is what makes an event
usable as a comparison group rather than just a date to worry about.

## Concepts: don't

Ingest creates **no** concept files. A column becomes a concept when a question needs it
in a graph. Creating one per column produces thousands of unused nodes and an unnavigable
wiki — the same failure as having none, by a different route.

When you do notice that two columns in different tables clearly mean the same thing, say
so in your summary. Do not merge them; the analyst decides, because `churn_30d` and
`churn_90d` look identical to a matcher and are two different causal variables.

## Privacy

Never write customer identifiers, free text or anything sensitive into the wiki. For
identifier-like or high-entropy columns, record only type, rough cardinality and null
rate. For low-cardinality categoricals and numerics, record the real distinct values and
ranges — that is what a notebook needs to write SQL and what the analyst needs to
sanity-check it.

## Finish with

A short summary: what was written where, what looked like a duplicate concept, what you
found that is dateable, and anything you could not classify.
