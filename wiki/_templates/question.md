---
id: q-0042
text: "Did the March price change drive churn?"
aliases: ["the March price thing", "Priya's churn question"]   # what people actually call it
opened: 2026-04-02
state: interviewing   # interviewing | notebook-issued | report-issued | result-in | concluded | abandoned
window: [2025-01-01, 2026-03-31]
outcome: churn_30d
treatment: price_change     # omit if there isn't one
graph: pricing

data_mode: live       # live | sample | simulated — decides what any number here is worth
deliverable: notebook # notebook | report | both
delivery: staged      # staged (dag first, default) | full (everything at once, they asked)
run_here: false       # true = we execute it; only possible for sample or simulated
dag_tested: no        # no | yes | failed — nothing gets promoted while this reads "no"

skills_used: []
methods: []                 # ["[[measuring-marketing-incrementality]]"] — standing methods used
experiments_used: []        # ["[[2025-q3-winback-holdout]]"] — where any prior came from
---

## What was asked
Verbatim, and what decision hangs on it.

## Verdict
Identified / not identified, and why. If not identified: what would work instead.

## Events in this window
- [[2026-03-price-uplift]] — the treatment itself
- [[2026-02-billing-migration]] — threat: overlaps the pre-period

## What we found

## What we learned
(goes into the wiki, not just here)

## Outcome log
Dated, append-only. Everything that arrives about this question lands here in order — the
result, what stakeholders decided, and whatever contradicts it three months later. Never
overwrite an entry; a record that quietly updates itself cannot be audited.

- 2026-04-18 — notebook returned, estimate 2.1pp (95% CI 0.4–3.8). {q:q-0042}
- 2026-05-02 — pricing team decided not to roll back; wanted the CATE by tenure first.
- 2026-07-11 — Q2 holdout put it at 0.9pp. Ours was high; the pre-period overlapped the
  billing migration after all. Trap written: [[did-with-contaminated-pre-period]].
