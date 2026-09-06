---
description: Write the report — the deliverable when the answer is an argument, not code
argument-hint: [optional: question id]
---
Not every question wants a notebook. A test design, a recommendation, a refusal with an
alternative — these are read and decided on, not executed.

Invoke the `writing-reports` skill and write `wiki/questions/<qid>/report.md` from
`wiki/_templates/report.md`.

Read first: `wiki/methods/` for a standing answer this must follow or argue with,
`wiki/experiments/` for what we already measured, and ask `scholar` what the field does.
A design that ignores our own past holdout is the failure this whole system exists to
prevent.

Hand it to `reviewer` — a design gets an independent check exactly like a graph does. Is
the unit right, is it powered, does treatment leak between units, and does a past
experiment already answer this?

**Then stop.** The analyst reads it, stakeholders decide. If it is approved it becomes a
standing method — and the method page records that it was approved as a **design**, with
`evidence: none-yet`, until something actually runs.

Question (default: the open one): $ARGUMENTS
