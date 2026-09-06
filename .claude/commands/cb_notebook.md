---
description: Write the analysis notebook
argument-hint: [optional: question id]
---
`reviewer` has ruled. Invoke the `writing-notebooks` skill and write
`wiki/questions/<qid>/notebook.ipynb`.

Before estimating, grep `wiki/experiments/` for the outcome and every treatment — a past
randomised estimate is a prior, and using it is not optional. Grep `wiki/methods/` for a
standing method, follow it, and name it in the header.

Header cell quotes the verdict, names the adjustment set and why, lists overlapping
events, states `data_mode` and **what a number from that mode is worth**, and states what
is assumed and cannot be checked.

If `data_mode: live` and no access skill exists for their system yet, hand that part to
`technician` — it writes the connection, you write the analysis. Do not invent a
connection snippet from memory.

If this was written under `delivery: full`, the graph has not been tested against data
yet. Say so in the first line of the header cell, not in a footnote.

If the verdict was a refusal, still write a notebook: say why no causal estimate is
possible, what design would work, and then do the descriptive work that is supportable.

Then stop and wait for the analyst to run it — unless they asked you to run it here, in
which case run it **and still hand over the `.ipynb`**.

Question (default: the open one): $ARGUMENTS
