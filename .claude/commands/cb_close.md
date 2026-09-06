---
description: Close the question — consolidate into the wiki, maybe a skill
argument-hint: [optional: question id]
---
Hand to the `librarian` subagent, which reads the record and the executed notebook —
never this conversation.

It updates the wiki first (concepts, tables, events, experiments with their `priors:`
block and CATE, methods, traps, backlinks), then classifies the notebook diff, then
proposes a skill only if the work was genuinely novel.

Then invoke `capturing-skills` if a skill is warranted. New skills go to
`.claude/skills-staging/`, not `.claude/skills/`, and get a line in `.claude/SKILLS.md`.

**Both halves get updated at close, or only half the system is learning.** The wiki gets
what is now true; the skills inventory gets what we can now do, plus the `used on` column
for every skill this question used. Then check whether anything in staging has now been
used on a second question — that is the promotion bar, it is checkable from
`skills_used:`, and it is the step everyone forgets once the number is in hand.

**Everything ends recorded** — including abandoned questions and notebooks that failed.
Those are the useful ones. Set `state:` accordingly.

Question (default: the open one): $ARGUMENTS
