---
name: running-an-interview
description: Conduct the interview that turns a business question into a well-posed causal question and a drawn graph. Use at the start of every new question.
---

# Running an interview

This is where the value is. Everything else is bookkeeping.

Delegate to the `interviewer` subagent, which has the full ladder. This skill is the
short form for when you are running it directly.

## Open by showing you already know

Read `wiki/README.md`, then grep the wiki for every noun in the question. Read what
comes back — concepts, events, processes, experiments, traps. Read
`wiki/questions/INDEX.md`; we may have answered this.

**Then walk the graph, which is the half that gets skipped.** Grep finds pages using the
analyst's words. It does not find the node we called something else, and it does not find
structure. So read every file in `wiki/concepts/` — it is small enough that reading it is
the search — and work out, before you speak:

- **What already causes the outcome.** Its `## Caused by` is every cause this company has
  already confirmed.
- **What the treatment already causes**, and what causes it — the assignment rule is often
  already recorded from an earlier question.
- **What is an ancestor of both.** That is an **already-established confounder**. State
  it; do not ask about it.
- **`observed:` and `measured_at:` on every node on those paths.** The most expensive
  answers to get out of an analyst, already written down. If an `observed: false` node
  already sits on an unblockable backdoor path, you may be able to reach the refusal
  before the first question — do it.
- **`graphs:`** — join the named area we already have rather than starting a parallel one.

Then open with the subgraph, not with the fact that you read it. *"We already have
`churn_30d` with three confirmed causes, one unobserved. Two of my questions are already
answered. The one thing the graph doesn't settle is…"*

**Never ask what the wiki or the graph already answers.** It is the fastest way this stops
feeling worth using, and it is the most likely way it degrades.

**Every fact the graph already holds is a question you do not have to spend** — which is
what makes the budget below reachable, and why the twentieth question here should cost a
fraction of the first.

Reuse the graph, but do not treat it as gospel: an edge with no `{by:... on:...}` span was
never confirmed by anyone, and a confirmed edge can go stale. If one looks wrong for this
question, say so and ask — never silently reverse it.

## Order

Outcome → population and window → **data mode** → **events and past experiments** →
assignment mechanism → graph → observability → timing → deliverable and delivery.

Pin the window before you look for events. Then grep `wiki/events/` for everything
overlapping it and show me **all of it**, unfiltered. Do not decide what is relevant —
the whole point is catching the one nobody remembered, and filtering defeats it.

Then grep `wiki/experiments/` for the outcome and for anything that looks like the
treatment. A past experiment is the strongest thing you can carry into an interview: a
prior to anchor rather than fit, a CATE saying where the effect is not homogeneous, and
a number the new estimate will have to be reconciled against. Show me those too, and say
which of their priors you intend to use.

Assignment mechanism is the highest-yield question in the interview. *Who got treated
and why?* The rule that decides who gets treated **is** the confounding.

## Data mode — ask it early, it is one question

*"When it comes to running this: is the data live in your environment, can you give me an
extract, or is there nothing yet and you want me to simulate it?"*

| `data_mode` | what it is | what a number from it is worth |
|---|---|---|
| `live` | runs against the real system where the analyst sits | an estimate about the company |
| `sample` | an extract they hand over — CSV, parquet, fixture | an estimate about **that extract**; the company only if it is the population or a documented random draw |
| `simulated` | nothing yet; generated from the graph | **nothing about the company, ever** — it tests that the code runs and that the estimator recovers a planted effect |

It is asked early because it changes what the rest of the ladder means. Under
`simulated`, `observed: true/false` is a design choice rather than a fact, and must be
marked as one. Under `live`, find out what the system is — and if there is no access
skill for it, that is `technician`'s job, not something to improvise in a notebook. Under
`sample`, ask where the extract came from and how it was filtered; a sample nobody can
describe is a sample nobody should estimate from.

**Only `live` — or a `sample` documented as the whole population — can produce a
`wiki/experiments/` prior.** That gate is what keeps synthetic numbers out of the
knowledge base, and it matters more than it sounds: a simulated effect size that leaks
into `experiments/` will be read a year later as something we measured.

## The deliverable — not everything is a notebook

Ask before assuming. *"Do you want code you run, or a written argument you and your
stakeholders decide on?"*

- **`notebook`** — there is a dataset and an estimate to make.
- **`report`** — a test design, a measurement recommendation, a refusal with the design
  that would work. These are read and decided on, not executed. They go to
  `wiki/questions/<qid>/report.md` via the `writing-reports` skill, and if approved they
  become a standing method.
- **`both`** — a design that also needs a power calculation or a simulation behind it.

Then: `staged` (DAG notebook first — the default, and the reason this system works) or
`full` (everything in one pass because they asked). Offer `full` honestly, including what
it costs, and do not argue past a clear answer. If they want it run **here** on a sample
or simulation, do that — and still write the `.ipynb`, every time.

## The interview has a budget

**Checkpoint at the third exchange, and every third one after.** On a count, not on a
feeling. Three routes, one short message: **proceed** (with the gap named), **keep going**
(with the next question and what it would change), or **park it**. Recommend one.

**Never ask a question whose answer would not change the graph, the verdict or the
notebook.** The target is a graph good enough to *test*, not one nobody could fault — the
notebook is better at finding what the interview missed than a fourth round of questions.

## How to ask

Ask what only I know. You read faster than I can recite; spend my attention on what is
not written down.

Confounders by mechanism, never by name — nobody answers "what confounds this?" well:

- "What else changed for the people who got this?"
- "If I sorted customers by tenure, would the treated ones look different?"
- "Who decided which customers got it?"
- "What would make you doubt this result?"

One question at a time.

## When the question has no dataset

"How should we measure incrementality?" "How do we prove MMM is worth it?" "A/B test or
a bandit?" These are methodology questions. Same loop — read first, interview,
`reviewer` — but the output is a page in `wiki/methods/`, not a graph.

`scholar` is not only for these. Pull it into any interview where a design choice is
live — which estimator, whether an event is usable as a natural experiment, whether a
test is powered. It is an expert in causal inference and experiment design and it has
read our library; treat it as a colleague in the room, and relay its `[lib]`/`[bg]`
markers to me rather than flattening them.

**Ask `scholar` before you answer one.** It reads `wiki/literature/` — the papers,
library docs and other companies' write-ups we have ingested — and separates what is
cited from what it is merely recalling. On a methodology question that separation is the
answer: "the field does X" carries weight when it is `[lib]` with a file name and much
less when it is `[bg]`.

**Read `wiki/methods/` before answering one.** If a standing method already covers it,
the answer *is* that method, and the conversation is only about whether this case is an
exception to it. Re-deriving from scratch what the company settled last year is the same
failure as asking what the wiki already answers.

If nothing covers it, the output is a new method page: what business actually asks, what
we do here, when it does not apply, what it costs, what it assumes, and the artefacts —
notebooks or write-ups — that came out of it. Link every question that used it.

**Never establish a standing method alone.** It binds every future question, so it is
proposed, reviewed and confirmed exactly like an edge.

## Write as you go

Concepts, edges, events, table notes — into the wiki during the conversation, not after.
A question that ends with a clean answer and an unchanged wiki was a wasted question.

Anything dateable becomes an event page immediately, even if this question does not need
it. Cheap to record now, expensive to reconstruct in a year.

## Stop

When the graph is complete enough for `reviewer` to judge identification. Early, if an
unobserved node already makes it unanswerable — get to the refusal, it is the useful
output. Or at a checkpoint, when the analyst says proceed. Their call.

Write `data_mode`, `deliverable`, `delivery`, `run_here` and `dag_tested` into the
question frontmatter before you hand off. Everything downstream reads them.

Then hand to `reviewer`. Always, before the *analysis* notebook — and for a `report`
deliverable too; a design gets an independent read exactly like a graph does.

`dag.ipynb` does not wait for the reviewer. The moment the edges are confirmed, write it
— build, falsify, fit, inspect — and give it to the analyst to run. The reviewer judges
the graph on paper; the notebook judges it against data. They catch different things.
See `writing-notebooks`.

Under `delivery: full` the analysis notebook goes out alongside it, unreviewed and
untested, because the analyst asked for the whole thing. That is allowed. What is not
allowed is letting anything out of it into the wiki while `dag_tested: no`.
