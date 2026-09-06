---
description: Open a new question and run the interview
argument-hint: "<what they said, verbatim>"
---
A question is opening. Verbatim, this is what was asked:

$ARGUMENTS

1. Read `wiki/README.md`, then grep the wiki for every noun in the question. Read what
   comes back — concepts, events, processes, experiments, methods, literature, traps.
   Read `wiki/questions/INDEX.md` too: this may be a question we have already answered.
   **Then walk the graph** — read `wiki/concepts/` and work out what already causes this
   outcome, what the treatment already causes, and what sits upstream of both. Anything
   upstream of both is a confounder we have already established, and it gets stated
   rather than asked about. Grep finds words; only the graph finds structure.
   **Then read `.claude/SKILLS.md`** — what we can already *do*. An existing access skill
   makes `live` data cheap instead of a project; an existing method skill means the
   analysis is largely written. This changes what is worth proposing, so it belongs
   before the interview, not after it.
2. Create `wiki/questions/<qid>/<qid>.md` from `wiki/_templates/question.md`. Next free
   id; `state: interviewing`. Fill `aliases:` with the words the analyst actually used —
   that is how anyone finds this again in a month.
3. Add the one-line entry to `wiki/questions/INDEX.md` now, not at close.
4. Invoke the `running-an-interview` skill and run the interview.

**Open by showing what you already found.** Never ask what the wiki answers.

Three things the interview has to settle beyond the graph, and the skill says when to ask
each:

- **`data_mode`** — `live` (real connection in their environment), `sample` (an extract
  they can give us), or `simulated` (no data; we generate it from the graph). This
  changes what every later number is worth, so it is asked early.
- **`deliverable`** — `notebook`, `report`, or `both`. Not every question wants code. A
  test design usually wants an argument on a page.
- **`delivery`** — `staged` (DAG notebook first, the default) or `full` (everything in
  one pass, because they asked).

**The interview has a budget.** Checkpoint at the third exchange and every third one
after: proceed, keep going, or park. The skill says how.

If the question has no dataset behind it, it is a methodology question — the skill has a
section for that, and it ends in `wiki/methods/`, not a graph.
