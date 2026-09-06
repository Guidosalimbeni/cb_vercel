---
id: 2025-q3-winback-holdout
ran: [2025-07-01, 2025-09-30]
design: randomised holdout   # randomised holdout | geo test | switchback | DiD | RDD | ITS
unit: customer
graph: retention
methods: ["[[measuring-marketing-incrementality]]"]
source: raw/2025-q3-winback-readout.pdf

# The block the next model reads instead of fitting freely. Fill it in or the page is
# half written.
priors:
  - parameter: winback_email_lift_90d_reactivation
    value: 0.018
    interval: [0.009, 0.027]
    scale: percentage points
    usable_as: informative prior on the winback channel coefficient
    stale_after: 2026-07-01   # when the programme last changed materially
---

## What was tested
10% holdout from the winback email programme.

## Design
Randomised at account level, stratified by tenure band. Powered to detect 1pp at 80%.

## What it found
Winback lifted 90-day reactivation by 1.8pp (95% CI 0.9–2.7).

## Heterogeneity / CATE
Where the effect is **not** the average. Record this even when you find nothing —
"no heterogeneity by tenure band, CI spans zero in every band" saves the next person a
week.

Effect concentrated in 6–18 month tenure (2.9pp); indistinguishable from zero under 3
months. No difference by acquisition channel.

## Priors this gives you
Spell out the number, the scale it is on, and what would make it stale. A Bayesian
model, an MMM, or anything with more parameters than identifying variation should be
centred on this rather than fitting it freely.

Centre the winback channel on 1.8pp with the CI as the prior width. **Do not** reuse it
for the reactivation SMS programme — different channel, never randomised.

## What it constrains in the graph
The randomisation means `winback_send` has no parents during the test window. Any DAG
that gives it one is describing a different period.

## Do not reuse this if
The programme creative or the eligibility rule has changed since. Check
`wiki/events/` before taking the prior.

## Questions that used it
- [[q-0042]] — as the prior on the winback coefficient.
