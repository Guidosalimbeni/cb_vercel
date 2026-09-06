---
description: Build the technical plumbing — a connection, a client, an export path
argument-hint: "<what needs reaching>"
---
Hand this to the `technician` subagent:

$ARGUMENTS

It owns everything about *reaching* a system — the warehouse, an API, a wiki, a chat
tool, wherever a result has to land. It writes **skills**, not analyses.

Tell it: what system, what the question actually needs out of it, and what the analyst
said about their environment during the interview. It will check `.claude/skills/` and
`.claude/skills-staging/` for an existing access skill before writing a new one.

Two things to relay back without softening: **what it ran versus what it only wrote**,
and any environment variable the analyst has to set for the snippet to work.

It never writes a credential into this repo. If it asks the analyst for one, that is a
bug — tell it to read from the environment instead.
