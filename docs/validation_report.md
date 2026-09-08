# Validation report

Processed on: 2026-08-29

## Source coverage

- PDF files audited in the supplied archive: **25**
- Relevant Tier 2 / Tier 3 PDFs used for target-market dataset: **24**
- CIS PDFs present in archive: **1**
- Target-market operator rows: **1035**
- Target-market game rows: **810**
- Country × report-date availability records: **69**

The CIS report contains no countries from the current target universe, therefore it contributes no dashboard rows. Tier 1 is absent from the supplied archive and is outside the current scope.

## Structural checks

- Operator duplicate keys `(report_date, country, rank)`: **0**
- Game duplicate keys `(report_date, country, rank)`: **0**
- Operator rows with missing APS / CEB / market share: **0**
- Game rows with missing game / provider: **0**
- Operator snapshots not containing exactly 15 ranked rows: **0**
- Game snapshots present but not containing exactly 15 ranked rows: **0**

Result: **PASS**.

## Coverage by target country

| Country | Operator periods | Game periods | Observed period |
|---|---:|---:|---|
| Mexico | 9 | 9 | 2026-02-27 — 2026-08-28 |
| Argentina | 9 | 9 | 2026-02-27 — 2026-08-28 |
| Chile | 9 | 9 | 2026-02-27 — 2026-08-28 |
| Colombia | 8 | 1 | 2026-03-07 — 2026-08-28 |
| Nigeria | 9 | 9 | 2026-02-27 — 2026-08-28 |
| Ghana | 8 | 8 | 2026-03-07 — 2026-08-28 |
| Senegal | 0 | 0 | — |
| Côte d’Ivoire | 0 | 0 | — |
| Togo | 0 | 0 | — |
| Uganda | 8 | 0 | 2026-03-07 — 2026-08-28 |
| Benin | 0 | 0 | — |
| India | 9 | 9 | 2026-02-27 — 2026-08-28 |

## Important interpretation rules

- `availability.csv` is the source of truth for whether operators/games are publicly available for a country/report date.
- Missing game data must be displayed as **«Данные отсутствуют»**; do not infer ranks or substitute zeroes.
- A game missing from a later Top-15 is only `OUT OF TOP-15`; its actual rank below 15 is unknown.
- Market-share values are stored as percentage points (e.g. `24.89`, not `0.2489`).
- APS and CEB are stored as absolute numeric values; display formatting belongs to the frontend.
