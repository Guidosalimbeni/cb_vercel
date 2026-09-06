---
name: writing-notebooks
description: Write the notebooks the analyst runs in their own environment. Use as soon as a graph is drawn — the DAG notebook comes before the reviewer's verdict, the analysis notebook after it.
---

# Writing the notebook

The analyst runs this somewhere you cannot reach. It has to be self-contained,
inspectable before it runs, and honest about what was assumed.

## Two notebooks, and the first one does not wait

1. **`wiki/questions/<qid>/dag.ipynb` — the moment the edges are confirmed.** Build the
   DiGraph from `wiki/concepts/`, draw it, falsify it against the data, fit the
   mechanisms, look at what does not fit. With DoWhy that is
   `gcm.falsify.falsify_graph`, `gcm.auto.assign_causal_mechanisms` and
   `gcm.evaluate_causal_model`. This notebook is not a preliminary — it is the only
   thing that tests a graph drawn in conversation against the data it claims to
   describe.
2. **`wiki/questions/<qid>/notebook.ipynb` — the analysis**, after `reviewer` has ruled.

Do not hold the first one back waiting for a complete plan, a verdict, or a method
decision. Write it, hand it over, and build the second against what comes back.

**Unless the analyst chose `delivery: full`** — see below. They can have both at once;
what they cannot have is the wiki treating an untested graph as settled.

## Three data modes, and they are not interchangeable

`data_mode` is in the question frontmatter. It decides what the data cell looks like and,
much more importantly, **what any number the notebook prints is worth.**

| mode | the data cell | what a result means |
|---|---|---|
| `live` | a real query against their system, using an access skill | an estimate about the company |
| `sample` | reads the extract they provided, by relative path | an estimate about **that extract** |
| `simulated` | a generator that builds data from the graph | **nothing about the company** |

**`live`** — the connection comes from an access skill in `.claude/skills/` or
`.claude/skills-staging/`. If none exists, that is `technician`'s job. Do not write a
connection snippet from memory: a wrong keyword argument costs the analyst an afternoon,
and you cannot test it from here.

**`sample`** — read from `wiki/questions/<qid>/data/` (question-scoped) or `raw/` (general
material), by relative path so it runs on their machine and yours. Assert the shape you
were told to expect: row count, columns, grain. And say in the header **what the extract
is** — if nobody can say how it was filtered, no estimate from it generalises anywhere,
and the notebook should say that rather than implying otherwise. If the sample is worth
reusing, it earns a `wiki/tables/` page.

**`simulated`** — the point is not to produce a number. The point is to **plant a known
effect and check the estimator recovers it.** So:

- generate from the graph as drawn — every edge in `wiki/concepts/` is a line in the
  generator, which is itself a useful check on whether the graph is even coherent
- put the true effect in a variable at the top, printed, and compare the estimate to it
- simulate the confounding too. A generator with no confounding proves the estimator
  works in a world we already know we are not in.
- make it reproducible: one seed, set once, at the top

Then say plainly, in the header and again in the result cell: **these numbers are about
the simulation, not the company.** A simulated effect size that leaks into
`wiki/experiments/` will be read a year later as something we measured.

**Only `live`, or a `sample` documented as the whole population, can produce a
`wiki/experiments/` prior.** That is the gate. `librarian` enforces it at close; you
enforce it by writing the mode into the header where nobody can miss it.

## You are not the one who runs it

Issue a notebook, then **stop and wait for the output**. Writing step two before step
one has been run is how an entire analysis ends up resting on a mechanism that never
fit.

If the analyst explicitly asks you to run the code in your own environment, do it — and
**still write the `.ipynb` as well**. Always, no exceptions. A result that lives only in
your context window is not reproducible, not inspectable, and not theirs.

`run_here: true` in the frontmatter means they have already asked. It is only possible
under `sample` or `simulated` — you cannot reach their warehouse — and it does not change
what the numbers are worth: a simulation you ran yourself is still a simulation. Paste
the output back into the conversation *and* leave it in the executed notebook, so what
you claim and what ran can be compared.

## `delivery: full` — everything in one pass

The default is staged, and staged is right: a graph confirmed in conversation and never
tested against data is a hypothesis, and every number built on it inherits that.

But the analyst can ask for the whole thing at once, and that is a legitimate request —
they may be time-boxed, or the DAG may be a formality on a graph they already trust.
**Give them all the code.** Do not stage it against their wishes and do not lecture.

What holds instead:

1. `notebook.ipynb` opens with the banner, in the **first line** of the header cell, not
   a footnote: *the graph in this notebook has not been tested against data; run
   `dag.ipynb` first and treat every estimate below as provisional until it passes.*
2. Hand both over together and say, once, which to run first.
3. `dag_tested: no` stays in the question record until the DAG notebook has actually been
   run and returned.
4. **While that flag reads `no`, nothing gets promoted.** No experiment page, no prior, no
   standing method, no skill out of staging, no number quoted onward as a finding.

The analyst gets the code immediately. The wiki waits for evidence. Those are different
things, and only the second one is a claim about the world.

## Header cells — before any analysis

Every notebook opens with a markdown cell stating, plainly:

- the question, verbatim, and **its question id** — so an output pasted into a chat three
  weeks from now can still be traced back to what was asked
- the verdict from `reviewer`, **quoted, not paraphrased** (or "not yet run", if this went
  out ahead of the review)
- **`data_mode`, and what a number from that mode is worth.** One sentence. This is the
  line that stops a simulated estimate being quoted in a steering deck.
- the adjustment set and *why those variables* — from the graph, not from your judgement
- events overlapping the window and how each is being handled
- what is assumed and cannot be checked from data

The analyst should not be able to run this without seeing what was assumed. That is the
header's whole job.

## Then the data cell

For `live`: real, fully-qualified table and column names, from the table pages. The joins
that work and the filters that are always needed — those are written down for a reason.
The connection itself comes from an access skill, not from memory.

For `sample`: the relative path, and assertions on the shape you were promised.

For `simulated`: the generator, the seed, and the true effect printed before anything
estimates it.

## Then assertions, before estimation

Cheap checks that catch the errors that complete silently and return plausible numbers:

```python
assert df.customer_id.is_unique, "grain broken — join fanned out"
assert 50_000 < len(df) < 500_000, f"row count {len(df)} outside expected range"
assert df.tenure_months.isna().mean() < 0.05, "unexpected nulls in tenure"
```

Wrong grain, a fan-out join, a filter that silently dropped a population — all of these
run clean and produce believable output. Assertions are the only thing standing between
that and a confident wrong number.

Name every assertion's failure message so the analyst knows what broke without reading
the code.

## Before estimating: what do we already know?

Grep `wiki/experiments/` for the outcome and for every treatment in the model. If a past
experiment measured any of them, you are not starting from a blank slate — you have a
**prior**, and using it is not optional.

This bites hardest on models with many parameters and little identifying variation.
Asked for an MMM in Meridian: the geo tests and holdouts in `wiki/experiments/` are
exactly what the channel ROI priors should be centred on. Fitting a channel freely when
a randomised estimate for it already exists throws away the best evidence in the
building, and the model will happily return something confident and wrong. State in the
header cell **which prior came from which experiment page**, so the analyst can see what
is data and what is inherited.

If the notebook reaches for a technique or a library you have not used here before, ask
`scholar` first. Not for a tutorial — for what the method assumes and what the library
actually does, cited from `wiki/literature/` rather than recalled. **Do not write a
function signature you have only remembered.** Mark it, ask, or make the notebook print
the signature it is about to rely on. A confidently wrong API costs the analyst an
afternoon and costs you their trust in everything else in the file.

Also grep `wiki/methods/`. If a standing method covers this class of question, follow it
and name it in the header. If you are departing from it, say so and say why — a silent
departure is how a company ends up with three incompatible definitions of incrementality.

## Record which skills you used

Read `.claude/SKILLS.md` before you write, and use what is there: an access skill for the
connection, a method skill for a problem shape we have handled before. Reusing one is the
point of having captured it.

Then **write every skill you used into the question's `skills_used:`**, including staged
ones. This is not bookkeeping. The promotion bar is "used on more than one question", so
a skill nobody records as used can never be promoted on evidence — and the library stops
growing while looking like it is fine. It costs one line.

If a staged skill turned out to be wrong or did not fit, record *that* too, in the
question record. A skill that failed on its second outing is information, and it should
cost the skill its standing rather than quietly not being mentioned again.

## Then the analysis

Follow the relevant skill in `.claude/skills/` if one applies. If the analyst named a
technique, use it — disagreeing while delivering is fine; refusing to deliver because
you disagree is not.

Verbs matter and get checked: backdoor is "adjust for", front-door is "estimate in two
stages through", IV is "instrument with". Saying "adjust for" a front-door mediator
invites exactly the error the wiki records as a trap.

## Then a result summary cell

Print estimates, standard errors, intervals, row counts, and every assertion outcome, in
one clearly-marked block. The analyst pastes this back — make it easy to copy and hard
to misread.

## For a refused question

Still write a notebook, and say at the top that no causal estimate can be made from this
data, why, and what the design would be instead. Then do the descriptive work that *is*
supportable. A refusal is not a reason to hand over nothing.

## Constraints

Self-contained: no imports from this repo, no paths into it, no network calls back. It
runs in a different environment with different packages, so keep dependencies boring and
state them at the top.
