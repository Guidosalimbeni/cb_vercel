---
description: Hand the question to reviewer for an identification verdict
argument-hint: [optional: question id]
---
Hand this question to the `reviewer` subagent.

It sees `wiki/` and the question record only — never this conversation. Do not summarise
the interview for it, do not tell it what you hope it concludes, and do not pre-empt its
verdict. That isolation is the entire point.

Give it: the question id, the record path, the question verbatim, the window, the
intended method, and the specific things you want stress-tested.

When it returns: record the verdict in the question record **quoted, not paraphrased**,
including its argument against itself. Verify any factual claim it makes about the data
before relaying it.

Question (default: the open one): $ARGUMENTS
