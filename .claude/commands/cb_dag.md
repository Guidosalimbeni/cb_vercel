---
description: Write dag.ipynb — test the drawn graph against data
argument-hint: [optional: question id]
---
The graph is drawn and the edges are confirmed. Write the DAG-assessment notebook now;
it does not wait for `reviewer`.

Invoke the `writing-notebooks` skill. Write to
`wiki/questions/<qid>/dag.ipynb`: build the DiGraph, draw it, check any arithmetic
identities, falsify it against the data, fit the mechanisms, evaluate the fit, and test
whatever the graph asserts that the edges themselves cannot show.

Transcribe the edges as a literal from `wiki/concepts/` rather than parsing the repo, so
it runs anywhere and is inspectable before it runs.

Read `data_mode` from the question record and write the data cell for it — a real query
for `live`, the extract's real columns for `sample`, a generator that plants a known
effect for `simulated`. The `writing-notebooks` skill says what each one owes the reader.

Then, if `delivery: staged` — the default — **stop and wait** for the analyst to run it.
Do not write the analysis notebook against a graph nobody has tested.

If `delivery: full`, the analyst has asked for everything in one pass. Write both, hand
them over together, and keep `dag_tested: no` in the record until the DAG notebook has
actually been run and returned. **Nothing gets promoted while that flag is `no`** — no
experiment page, no prior, no method, no skill out of staging.

Question (default: the open one): $ARGUMENTS
