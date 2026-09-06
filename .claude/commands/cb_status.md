---
description: What is open, and what is it waiting on
---
Read `wiki/questions/INDEX.md`, then every `wiki/questions/*/*.md` frontmatter, and
report briefly:

- each open question, its `state`, and **what it is blocked on**
- any notebook or report issued but not returned
- any question in `state: interviewing` with no confirmed edges yet
- **any question with `dag_tested: no` that has an analysis notebook** — the graph is
  still untested and nothing from it can be promoted
- any method at `evidence: none-yet` whose design has now had time to run
- counts: concepts, events, experiments, methods, literature pages

One line per question. No prose.

Then **the skills pipeline**, because that half rots silently — read `.claude/SKILLS.md`
and `grep -rn "skills_used" wiki/questions/`:

- what is in staging, and how many questions each has actually been used on
- **anything at two or more uses — that has met the promotion bar.** Name it and the
  questions; the analyst decides, you do not promote it.
- anything in staging that has sat unused since it was captured. It may be too narrow, or
  named so nobody finds it.
- any skill used in a question but missing from `.claude/SKILLS.md`, or the reverse

If `wiki/questions/INDEX.md` or `.claude/SKILLS.md` has drifted from the records, fix it.
Both are entry points, and a stale index is worse than none because people trust it.
