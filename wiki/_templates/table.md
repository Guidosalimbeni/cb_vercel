---
id: analytics.mart.churn
system: snowflake
grain: one row per customer per month
source: raw/2026-03-semantic-layer.yaml
---

## Columns
| column | type | means | concept | measured_at | notes |
|---|---|---|---|---|---|
| customer_id | text | account key | — | — | join key |
| churn_30d | bool | cancelled within 30d of month end | [[churn_30d]] | post_treatment | false zero for <30d tenure |
| tenure_months | int | months since signup | [[customer_tenure]] | pre_treatment | |

## Joins that work
`analytics.mart.churn` to `analytics.dim.customer` on `customer_id`, both current-only.

## Filters you always need
`is_current = true` — otherwise migrated accounts appear twice.

## Columns that lie
`signup_date` is the *record creation* date, not the signup date, for anything before
the 2024 migration.
