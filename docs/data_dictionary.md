# Data dictionary

## `data/operators.csv`

One row = one operator rank in one country on one report date.

- `report_date` — source report date, ISO `YYYY-MM-DD`
- `country` — canonical English country name
- `region` — dashboard business segment: `LATAM`, `WEST AFRICA`, `INDIA`
- `tier` — source report tier
- `rank` — source Top-15 rank, integer 1–15
- `brand` — operator/brand name as published
- `aps` — APS normalized to absolute numeric value
- `ceb_usd` — CEB normalized to absolute USD numeric value
- `market_share_pct` — published market share in percentage points
- `source_report` — original source PDF filename

## `data/games.csv`

One row = one game rank in one country on one report date.

- `report_date`
- `country`
- `region`
- `tier`
- `rank`
- `game`
- `provider`
- `source_report`

## `data/availability.csv`

One row = one target country/report-date combination observed in the source reports.

- `report_date`
- `country`
- `region`
- `operators_available`
- `games_available`

Use this table to distinguish source-level absence from UI/technical errors.

## `data/reports.csv`

Registry of already processed Tier 2 / Tier 3 source reports. The future updater should use it for deduplication.

## `data/update_history.csv`

Audit trail of import/update runs. Initial package contains the historical import rows.

## `data/status.json`

Small frontend status object containing:
- `last_checked`
- `last_updated`
- `latest_reports`
- `status`

## Date-dropdown contract

For every country, available report dates must be sorted **oldest → newest**.
The newest available date must be the final option and the only option labelled `(latest)`.
The frontend may select the latest date by default, but must never reverse the dropdown ordering.
