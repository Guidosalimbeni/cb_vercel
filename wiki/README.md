# The wiki

Everything true about this company, in markdown. Read this file first, every session.

## This is one half of the system

`wiki/` is **what is true about this company** — the graph, the tables, the events, what
we have already measured, what we have read.

`.claude/skills/` is **what we have learned to do here** — connecting to the warehouse,
the estimator that works when a display rule rather than randomisation decides exposure,
how a result gets written up so people here act on it. The inventory is
`.claude/SKILLS.md`, and it says how a skill earns its way from staging into trusted.

Neither was written in advance. **Both accumulate from real questions, and they
accumulate together**: a question adds facts to the wiki and, when the work was genuinely
novel, a procedure to the skills. A question that leaves both unchanged was a wasted
question.

| Folder | What lives there | Written when |
|---|---|---|
| `concepts/` | **The causal graph.** One file per variable. | During interviews |
| `tables/` | Semantic layer: tables, columns, grains, joins, filters, gotchas | Ingest |
| `events/` | What the company changed, and when | Interviews and ingest |
| `processes/` | How the business actually works, in prose | Ingest and interviews |
| `experiments/` | Past tests, what they found, **and the priors they hand you** | Ingest and close |
| `methods/` | **How we measure things here.** Standing methodology, reviewed | When a methodology question is settled |
| `literature/` | **What the field says.** Papers, library docs, other companies | Ingest |
| `traps/` | Mistakes that keep happening here | After questions |
| `questions/` | One folder per question: record, notebook or report, result | The whole lifecycle |
| `questions/INDEX.md` | **One line per question. The entry point.** | At ask, and at close |

Templates for each are in `_templates/`.

## Finding a question again a month later

Nobody says "q-0042" out loud. They say "that Avios thing", or "what Priya asked before
the offsite". Three mechanisms, all cheap, and they only work if they are kept up:

1. **`questions/INDEX.md`** — one line each, and a single file read. Look here first,
   before assuming a question is new.
2. **`aliases:` in the question frontmatter** — the words people actually use, written the
   way they say them. This is what makes grep work later.
3. **`{q:q-0042 on:2026-09-06}` on anything a question wrote** — the same visible span the
   graph uses for edges. One convention, both jobs.

And when something arrives after the fact — the test ran, the stakeholders decided, the
estimate turned out wrong — it goes into that question's `## Outcome log`, dated,
append-only, via `/cb_outcome`. **A concluded question is not closed to evidence.**

## The graph

One markdown file per variable in `concepts/`. The headings carry direction and kind —
Obsidian's graph view has neither, so the structure has to.

- `## Caused by` — incoming causal edge
- `## Causes` — outgoing causal edge
- `## Computed from` — **arithmetic only**, never causal

An edge may be declared from either end. Each bullet is a wikilink, one line of
reasoning, and a `{by:... on:...}` span recording who confirmed it. No span means
nobody has confirmed it yet.

`measured_at` in the frontmatter is the most valuable field in the wiki. It is what
stops a mediator being used as a control, and no semantic layer records it.

## Concepts vs columns

A **concept** is a causal variable and gets a node file. A **column** is one physical
place it is stored and lives on a table page. Many columns, one concept.

Merge two columns into one concept only if a causal claim about one is a causal claim
about the other: same quantity, same grain, same timing. `churn_30d` and `churn_90d`
are two concepts, not one — different timing, and they can sit on opposite ends of the
same edge.

**Do not create a concept for every column.** A column becomes a concept when a
question needs it in a graph. Most never will.

## Named graphs

`graphs: [pricing, retention]` in the frontmatter. A company has many loosely-connected
causal areas and one big graph is unreadable. Membership is declared in the node, never
in a separate list, so nothing can fall out of sync.

## Methods and experiments get read *before* the graph

Two folders answer questions that are not about any one dataset.

`methods/` is the company's standing answer to "how should we measure this?" —
incrementality, holdout design, when a contextual bandit beats a fixed A/B test, what
MMM is and is not good for. Some have a notebook behind them, some are a white paper,
some are one hard-won paragraph. Every page carries `tags: [method]` and lists the
questions that used it, so a technique and the artefacts built with it stay linked in
both directions.

A method is **amended, never quietly replaced.** It binds every future question, so a
change to one is proposed, reviewed and confirmed the way a causal edge is.

Every method page carries **`evidence:`** as well as `status:`, and they are different
claims. `status: established` means everyone here follows it. `evidence: none-yet` means
nothing has tested it — the honest and common state for a design that stakeholders
approved before it ran. Such a method binds future questions **as a convention, not as a
finding**, and says so on its face. When something finally runs, the page is amended and
`evidence:` moves to `ran-once`, then `replicated`. A design that turned out wrong is
amended too, and that amendment is worth more than the original page.

`literature/` is everything read from outside: DoWhy or Meridian documentation, a paper
worth keeping, a blog post from a company with our problem. Each page records the claim
*stated precisely enough to be wrong*, what it assumes, what it does **not** cover, and a
trust level with a reason. The `scholar` agent reads this folder before answering
anything methodological, and it marks its own claims `[lib]` or `[bg]` so a citation is
never confused with a recollection.

`experiments/` is what we have already measured. Read it before designing anything. A
randomised estimate is a **prior**: fitting a parameter freely when an experiment
already measured it throws away the best evidence in the building. This is the whole
reason the folder exists — asked for an MMM, the channel priors should come from the
geo tests and holdouts recorded here, not from a default.

## Seeing the graph in Obsidian

Every file in `concepts/` carries `tags: [dag]`. **Nothing else in the wiki carries it.**
That single tag is the whole mechanism: type `tag:#dag` into the graph view's search box
and the tables, events, processes and question records drop away, leaving the causal
graph on its own.

`wiki/methods/` carries `tags: [method]` and `wiki/literature/` carries
`tags: [literature]`, on the same principle. Swap the search box to `tag:#method` for the
methodology layer or `tag:#literature` for what we have read.

**Three tags, three layers: what is true here, how we measure it, what the field says.**
Stop there. The headings already carry direction and kind, and a fourth tag vocabulary
that duplicates them will drift out of sync with them.

## Finding things

Grep. `rg "churn" wiki/`, `rg "measured_at: post_treatment" wiki/concepts/`,
`rg -l "pricing" wiki/concepts/`. The wiki is small enough that search is reading.
