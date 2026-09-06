---
id: q-0047-report
question: [[q-0047]]
kind: design                 # design | recommendation | refusal
written_on: 2026-09-06
reviewed_by: reviewer        # a design gets an independent read, same as a graph
status: draft                # draft | with-stakeholders | approved | rejected | superseded
approved_by: —               # who, and when
becomes_method: —            # [[method-id]] once approved
---

## Recommendation
One paragraph, first, in the words a stakeholder would use. They may read nothing else.
No build-up — if this paragraph is throat-clearing, the report has failed for most of
its audience.

## What we would do
Concretely enough to act on. Unit of randomisation, split, duration, what gets measured
and when.

## What it costs
Real numbers. Forgone revenue on a holdout, weeks of calendar time, engineering effort.
A design with no cost stated is a wish, not a proposal.

## What it can answer — and what it cannot
Every design looks like it answers a broader question than it does. Name the gap here
yourself. A stakeholder who finds it later will trust nothing else in the document.

## The number that decides it
The MDE, and whether an effect that size is one anyone would act on. **An underpowered
test reported as a null is the most expensive mistake available here**, and it is
designed in at this stage, not discovered at the end.

## What we already know
From `wiki/experiments/` — what a past holdout or geo test already measured, and what
this would add to it. Proposing a test for something we measured in March is a real and
avoidable waste.

## What the field says
From `scholar`, with `[lib]` and `[bg]` markers kept separate. A remembered effect size
is a lead, not a fact.

## Reviewer verdict
Quoted, not paraphrased, including its argument against itself.

## What would change this recommendation
State it, so that when it happens somebody notices.

## Decision
- 2026-09-12 — approved by <name>. Becomes [[method-id]] at `evidence: none-yet`.
