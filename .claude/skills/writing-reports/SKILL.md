---
name: writing-reports
description: Write the deliverable for a question whose answer is an argument rather than code — a test design, a measurement recommendation, a refusal with the design that would work. Use when the question record says deliverable is report or both.
---

# Writing the report

**Not every question wants a notebook.** "Should we A/B test this or run a bandit?" "How
should we measure the loyalty programme?" "Is this worth testing at all?" The answer is a
written argument that the analyst and their stakeholders read and decide on. Handing that
over as an `.ipynb` is a category error — nobody executes a decision.

It goes to `wiki/questions/<qid>/report.md`, from `wiki/_templates/report.md`.

## Read before you write

- `.claude/SKILLS.md` — a **REPORTING** skill may already say how a result gets written up
  so people here act on it, and a **METHOD** skill may already cover this design. Use them,
  and record them in the question's `skills_used:`.
- `wiki/methods/` — **if a standing method covers this, the answer is that method**, and
  the report is about whether this case is an exception. Re-deriving what the company
  settled last year is the same failure as asking what the wiki already answers.
- `wiki/experiments/` — what we already measured. Proposing a test for something a
  holdout answered in March is a real waste and an embarrassing one.
- `scholar` — what the field does, `[lib]` where we have read it and `[bg]` where it is
  recalling. Relay both markers; do not flatten them.

## What a report owes the reader

**The recommendation first.** One paragraph, at the top, in the words a stakeholder would
use. Not a build-up — they may read nothing else, and if the first paragraph is
throat-clearing then the report has failed for most of its audience.

**What it would cost.** Real numbers: forgone revenue on a holdout, weeks of calendar
time, engineering effort. A design with no cost stated is not a proposal, it is a wish.

**What it can and cannot answer.** Every design looks like it answers a broader question
than it does. Name the gap yourself — the alternative is a stakeholder finding it later
and trusting nothing else in the document.

**The number that decides it.** For a test: the MDE, and whether an effect that size is
one anyone would act on. **An underpowered test reported later as a null is the most
expensive mistake this folder can produce**, and it is designed in at this stage, not
discovered at the end.

**What would change the recommendation.** State it, so that when it happens somebody
notices.

## Then hand it to `reviewer`

A design gets an independent read exactly like a graph does — unit of randomisation,
power, interference, whether a past experiment already answers it. Record the verdict in
the report **quoted, not paraphrased**, including its argument against itself.

## Then stop

The analyst reads it. Stakeholders decide. That decision is not yours and not
`reviewer`'s.

## When it is approved: it becomes a method

This is the whole point of writing it down. An approved design goes to `wiki/methods/` as
the company's standing answer, linked back to the question that produced it.

**Approval is the right gate here — and it is not evidence.** A design cannot have
empirical support before it runs; somebody has to decide to run it, and that decision is
a legitimate act of authority. But the method page says what it has and has not earned:

- `evidence: none-yet` — approved as a design, never run
- `evidence: ran-once` — run once; what happened is recorded on the page
- `evidence: replicated` — held up more than once

A method at `none-yet` binds future questions **as a convention, not as a finding**, and
it says so on its face. When the test finally runs, the method is **amended** with what
actually happened — and if the result contradicts the design, that amendment is the most
valuable paragraph in the wiki.

**This is a different gate from the one skills pass.** A skill is promoted on evidence,
because it claims something *worked*. A design is adopted on a decision, because it claims
something is *worth trying*. Do not blur them: "the stakeholders liked it" still never
promotes a skill out of staging.
