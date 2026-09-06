---
id: 2026-03-price-uplift
date_start: 2026-03-14
date_end: 2026-03-14        # same date = sharp cutover; a range = staggered rollout
announced_on: 2026-02-01    # null if unannounced — anticipation breaks several designs
touches: [price_change, churn_30d]
visible_in_data: partial    # yes | no | partial
source: raw/2026-03-comms.md
recorded_by: guido
recorded_on: 2026-03-20
---

## What changed
Monthly plan price went from £12 to £14.

## Who it applied to
UK direct, monthly plans only.

## Who it did NOT apply to
Annual plans. All US. Anyone on a legacy grandfathered rate.

**That boundary is the whole value of this page** — it is what makes this usable as a
comparison group rather than just a date to worry about.

## Why it matters causally
Sharp cutover with a clean untreated group: candidate DiD or interrupted time series.
Announced six weeks ahead, so anticipation is possible in February.
