---
name: reading-results
description: Handle an executed notebook coming back from the analyst — read the output, judge what it means, and route what was learned. Use when the analyst returns a notebook or pastes results.
---

# Reading what comes back

The analyst ran the notebook elsewhere. It may have been repaired out there before it
ran. Save what comes back to `wiki/questions/<qid>/result/`.

## First, which notebook is this?

If it is `dag.ipynb`, set `dag_tested: yes` in the question record when it ran clean, or
`failed` when the graph did not survive contact with the data. **`failed` is a result, not
a setback** — a graph the data rejects is the most useful thing this system produces, and
it means going back to the analyst with what did not fit, not quietly adjusting the graph
until it passes.

If it is `notebook.ipynb` and `dag_tested` still reads `no`, say so before anything else.
Under `delivery: full` that is expected — the analyst asked for both at once — but the
estimate is provisional until the DAG notebook runs, and nothing from it gets promoted.

## Then, what mode was this?

Read `data_mode` before reading the number, because it decides what the number is.

- `live` — an estimate about the company.
- `sample` — an estimate about the extract. Say so every time you quote it, unless the
  record documents the extract as the whole population.
- `simulated` — **not a result about the company.** What it tells you is whether the code
  runs and whether the estimator recovered the planted effect. If it did not recover it,
  that is the finding, and it is a real one: the estimator does not do what we thought it
  does on a graph this shape. Report it as a fact about the method, never about the
  business.

## First, the assertions

Before reading a single estimate: **did the assertions pass?**

If any failed, the analysis table was wrong and the estimate means nothing. Say so
before discussing the number. An estimate from a broken table is worse than no estimate,
because it looks like evidence.

**If an assertion was deleted or weakened to make the notebook run, say so loudly.**
Check the returned notebook against the issued one. This is the most dangerous thing
that can happen in the round trip — it is invisible in the output, it converts a broken
analysis into a clean-looking result, and it takes ten seconds to check.

## Then, what changed in the notebook

Diff issued against returned, and classify — most repairs are *good news*:

- **Environment repair** (missing import, session config, path, package pin) → the
  environment taught us something. Write it onto the relevant table or process page.
  Nothing is wrong with the analysis.
- **Data-shape repair** (wrong column, wrong grain, corrected join) → **the wiki was
  wrong.** Fix it. This is the most valuable correction available and it should never
  pass silently.
- **Method rewrite** → the procedure was wrong. Note it against whatever skill produced
  it.
- **Additions** → exploration. Ignore.

## Then, the result itself

Report the estimate with its interval, the population it applies to, and the assumptions
from the header that remain unverifiable. Do not let the caveats detach from the number
— they travel together or the number travels alone and gets misused.

Then, before anything else: **what would explain this result other than the causal
story?** Name the three most plausible alternatives and, for each, the check that would
rule it out. Prefer the overlapping events as candidates — they are already written down
and already suspected.

## If it is a decomposition

Contributions must sum to the observed movement. State the unexplained residual
explicitly and never absorb it. If a large share is unaccounted for, that is the
finding: an unmodelled driver is present, and the events in the window are the first
place to look.

## Then

Append what came back to `## Outcome log` in the question record, dated. Everything that
arrives about this question — this result, the stakeholder reaction next week, the thing
that contradicts it in November — goes in the same place, in order. That log is how
somebody reconstructs later what we believed and when.

Ask whether this concludes the question or whether we iterate. If it concludes it,
run `librarian` — the wiki update is the point, and it is the step most likely to get
skipped once everyone has the number they wanted.

If something arrives later that is *not* an executed notebook — a decision, a stakeholder
verdict, a test that finally ran — that is `/cb_outcome`, and it will find the question
from the words people used rather than the id.
