---
name: capturing-skills
description: Decide whether a concluded question produced a reusable procedure, and write it up if so. Use at close, after the wiki has been updated.
---

# Capturing a skill

A skill is a procedure for doing something *in this company*. Not a causal inference
tutorial — the model already knows those. What is worth capturing is the part that took
work to figure out and is specific here.

## Three kinds

**ACCESS** — how to reach this company's systems. Connecting, warehouse conventions, the
joins that work, the filters always needed, how to assemble an analysis table for a
given kind of question. Also how a result gets *out* — to a docs wiki, a chat channel,
whatever people here actually read.

**Access skills belong to `technician`.** If one of these is what came out of the work,
hand it over rather than writing it yourself: it knows to check for an existing skill
first, it keeps credentials out of the repo, and it makes the snippet prove its own
connection before anything depends on it.

**METHOD** — how this company does a kind of causal analysis. Not the textbook estimator
— the version of it that survived contact with this business. *"For a checkout add-on
where a display rule decides eligibility rather than randomisation, here is the procedure
that worked, here is the assertion that catches the fan-out, and here is what we tried
first that didn't."* These are the most valuable skills captured here and the easiest to
lose, because the person who worked it out thinks it was obvious by the time they
finished.

**REPORTING** — how a result gets written up so stakeholders here can act on it.

## When to capture

Only when the work was genuinely novel. Check first:

- Has this kind of analysis, on this graph, been done before?
- Were new concepts or edges created?
- Did an existing skill already cover it?

**One skill per question, at most.** A library of two hundred one-offs is as useless as
none, and harder to search.

## The test that decides it

**Can you say what varies next time?**

The treated cohort definition. The pre-period length. Which control series. Which tables
it reads. If you can name what changes, it is a skill. If you cannot, this is a record
of one analysis — write it as a note on the concept and stop.

That test is the whole filter, and applying it honestly is what keeps the library small
enough to be worth reading.

## Where it goes

`.claude/skills-staging/<name>/SKILL.md`. **Staging, not `skills/`.** A skill from one
piece of work is unproven and should not be auto-loaded into every future session. It
gets offered when it looks relevant; it does not get assumed.

**Then add it to `.claude/SKILLS.md`.** A skill nobody can see does not exist: the next
question will re-derive it, which is exactly the waste this is meant to prevent. One line
— kind, standing, the question it came from, what it is for.

```markdown
---
name: did-pricing-rollout
description: <when to use this — the trigger, in the analyst's words>
---

## When this applies
The conditions. Be strict: a skill that claims too broad a scope will be applied where
it does not fit, and that is worse than not having it.

## What varies
- the treated cohort definition
- the pre-period length
- which control series

## The procedure
Steps. Include what was tried first and did not work — that is often the most useful
part, and it is the part nobody writes down.

## Where it came from
q-0042. What evidence it has, and what it does not.
```

## Moving it to `skills/`

The analyst decides. The bar:

- used on **more than one question**, or
- its output was **checked mechanically** — the notebook ran clean and its assertions
  held.

**Approval alone is not enough.** Most company analytics is agreed with and wrong. If
"the stakeholders liked it" promoted skills on its own, this becomes a system that gets
progressively better at being persuasive here — which is the exact failure it exists to
prevent. Say so if you are asked to promote on that basis.
