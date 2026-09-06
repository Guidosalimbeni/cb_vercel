---
id: churn_30d
label: 30-day churn
observed: true              # false is a claim — say where it came from in `source`
measured_at: post_treatment # pre_treatment | post_treatment | concurrent | unknown
graphs: [retention]
tags: [dag]                 # every concept, nothing else — filters the Obsidian graph view
source: interview/2026-03-04
confirmed_by: guido
confirmed_on: 2026-03-04
---

## Caused by
- [[price_change]] — repricing shifts cancellation within the billing cycle. {by:guido on:2026-03-04}
- [[support_wait_time]] — long waits precede cancellation. {by:guido on:2026-02-11}

## Causes
- [[net_revenue]] {by:guido on:2026-03-04}

## Computed from
- [[cancellations_30d]], [[active_base]] — ratio. Arithmetic; never a causal edge.

## Where it comes from
`analytics.mart.churn.churn_30d` — one row per customer per month. Join on
`customer_id`. Requires `is_current = true` or you double-count migrated accounts.

## Notes
Reads as a false zero for anyone who signed up in the last 30 days. Bit us in q-0017.

## Questions that turned on this
- [[q-0042]] — did the March price change drive churn?
