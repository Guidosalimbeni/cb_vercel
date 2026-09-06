# What we can already do

The other half of this system. `wiki/` records **what is true about this company**; these
record **what we have learned to do here**. Neither was written in advance; both
accumulate from real questions.

One line per skill. Updated when one is captured, used, or promoted — by `librarian` at
close, and by `technician` when it builds access.

**Read this before opening a question.** What we can already do changes what is worth
proposing: an existing warehouse connection makes `live` data cheap rather than a
project, and an existing estimator for a shape of problem that recurs here means the
analysis is mostly written already.

| skill | kind | standing | used on | what it is for |
|---|---|---|---|---|
| *(example)* `snowflake-holdout-pull` | ACCESS | staging | q-0031 | assembling a treated/control table from the warehouse |
| *(example)* `did-checkout-eligibility` | METHOD | trusted | q-0031, q-0044 | DiD where a display rule, not randomisation, decides exposure |

## Kinds

- **ACCESS** — reaching a system. Warehouse connections, API clients, export paths,
  wherever a result has to land. `technician` owns these.
- **METHOD** — how this company does a kind of causal analysis. The estimator that worked
  for a problem shape that recurs here, what varies between instances of it, and what was
  tried first that did not work.
- **REPORTING** — how a result gets written up so people here actually act on it.

## Standing

- **staging** — `.claude/skills-staging/`. Captured from one question, unproven. Offered
  when it looks relevant; never assumed.
- **trusted** — `.claude/skills/`. Auto-loaded. It got there by being **used on more than
  one question**, or by having its output **checked mechanically** — the notebook ran
  clean and its assertions held.

`skills_used:` in each question record is what makes the first bar measurable. If nobody
writes it, nothing can ever be promoted on evidence, and this library stops growing.

**Approval is not a promotion criterion.** Most company analytics is agreed with and
wrong. A system that promoted skills because stakeholders liked the output would get
progressively better at being persuasive here, which is the exact failure this whole
thing exists to prevent.
