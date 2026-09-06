---
id: dowhy-gcm-intrinsic-causal-influence
kind: docs                # docs | paper | blog | book | talk | thread
title: "DoWhy — Intrinsic Causal Influence"
authors: [Janzing, Bloebaum]
year: 2024
version: dowhy 0.14       # for docs: which version. Docs for another major version are not evidence.
source: https://www.pywhy.org/dowhy/
local_copy: raw/2026-08-dowhy-gcm-docs.html   # the immutable original, if we kept one
retrieved_on: 2026-08-14
tags: [literature]
topics: [variance-attribution, scm, shapley]
relates_to: ["[[profit]]", "[[measuring-marketing-incrementality]]"]
trust: high               # high | medium | low — justify it below
---

## What it says
Two or three sentences. Not the whole thing — the part we would actually use.

## The claim we would rely on
Stated precisely enough to be **wrong**. That is the test.

> Intrinsic causal influence attributes the variance of a target to the *noise terms* of
> upstream nodes, so a node whose mechanism is deterministic given its parents receives
> approximately zero.

"ICI is good for attribution" fails the test. The sentence above passes it.

## What it assumes
The assumptions, and which of ours they collide with. **This section is what earns the
page.** Anything can be made to sound applicable if the assumptions are left out.

## What it does NOT cover
Just as important — the boundary is what stops it being over-applied.

> Says nothing about behaviour when a mechanism is fitted with a model class that cannot
> represent the true function. The ~0 is a property of the population SCM, not a
> guarantee about what the estimator returns.

## Applicability here
What it changes for us, given `wiki/methods/` and the graph as drawn. If the answer is
"nothing yet", write that — a page recording why we did **not** use something is worth
keeping, and it stops the same idea being re-litigated every six months.

## Trust: why
- `high` — official docs for the version we run, or a result we have checked ourselves.
- `medium` — reputable preprint or engineering blog. Plausible, unverified.
- `low` — anecdote, marketing, or something we tried and could not reproduce.

A vendor blog arguing for the vendor's own method is `low` however well written. Say
which and why, in one line.

## Used in
- [[q-0001]] — the basis for choosing `intrinsic_causal_influence` over `arrow_strength`.
