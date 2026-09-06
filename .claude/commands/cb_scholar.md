---
description: Ask the causal-inference expert
argument-hint: "<the question>"
---
Put this to the `scholar` subagent:

$ARGUMENTS

It is an expert in causal inference and experiment design, and it is the only agent that
reads `wiki/literature/` — the papers, library docs and other companies' write-ups we
have ingested.

Expect every claim marked `[lib: <file>]` or `[bg]`. Relay both markers when you report
back; a `[bg]` specific — an API signature, a paper's exact number — is a lead to check,
not a fact to build on.

If it names sources worth ingesting, tell the analyst. That is usually the most valuable
part of its answer.
