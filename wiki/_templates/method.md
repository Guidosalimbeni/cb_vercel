---
id: measuring-marketing-incrementality
kind: principle              # principle (how we decide) | technique (how we execute)
status: established          # proposed | established | superseded
evidence: replicated         # none-yet | ran-once | replicated
tags: [method]
established_on: 2026-04-11
established_by: guido
approved_by: —               # who signed off, if this came from an approved design
reviewed_by: reviewer
supersedes: —                # [[old-method-id]] if this replaces one
from_question: [[q-0031]]    # where it came from, so the reasoning is one click away
artefacts:
  - wiki/questions/q-0031/notebook.ipynb   # a notebook that implements it
  - wiki/questions/q-0031/report.md        # or the report that proposed it
  - raw/2026-03-incrementality-memo.pdf    # or a write-up
---

<!-- `evidence:` is not `status:`. A method can be established — everyone follows it —
     while having never been tested: that is `status: established, evidence: none-yet`,
     which is an honest and common state for a design that stakeholders approved. It
     binds future questions as a convention, not as a finding. When something finally
     runs, amend the page and move `evidence:` on. -->


## The question business actually asks
Verbatim, in their words, not ours. *"How much extra revenue did the campaign actually
drive?"* — usually meaning "was it worth it", occasionally meaning "who should get
credit".

## What we do here
The standing answer. Specific enough to act on.

1. A geo or user-level **holdout** if the spend is large enough to power one. First
   choice, always.
2. If not, a **permanent holdout** — a fixed 5% never exposed to the programme. Costs
   5% of the programme's value forever and buys an unbiased estimate whenever anyone
   asks. Worth it for anything running longer than two quarters.
3. **Uplift modelling** only on top of a holdout, never instead of one. It tells you
   *who* to target; it cannot tell you whether the programme works.
4. **MMM** for budget allocation across channels, never for "did this campaign work".
   Anchor its channel priors on whatever `wiki/experiments/` already measured.

## When this does not apply
Name the exceptions honestly, or people will apply it where it breaks. Below roughly
£50k spend a holdout is not powered and this is the wrong frame — say so rather than
running an underpowered test and reporting the null.

## What it costs
The holdout is real forgone revenue. Say the number.

## What it assumes
No spillover between holdout and treated. Breaks for anything with a referral or
social component, and that is not a footnote.

## Why we settled on this
The reasoning, and what we tried first. A method with no history gets re-litigated
every year.

## Amendments
- 2026-04-11 — established. {by:guido}
- 2026-08-02 — permanent-holdout threshold moved from one quarter to two after q-0055
  showed the estimate was still too noisy at one. {by:guido}

## Questions that used it
- [[q-0031]] — did the Q1 brand campaign drive signups?
