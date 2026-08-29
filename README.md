# Finance Planner v4

A static, local-first personal finance **Financial Command Center** designed for GitHub Pages. All financial data stays in browser storage unless the user explicitly exports a backup.

## What v4 does

- Multi-account cash balances with checking, savings, cash, and optional additional accounts
- One-time, weekly, bi-weekly, monthly, and yearly income/expenses
- Automatic transaction categorization with editable categories
- Calendar-safe recurring forecasts and month-end handling
- Actual-vs-planned tracking from a saved cash checkpoint
- Occurrence-level reconciliation: planned, completed, or skipped, with actual amount/date/account overrides
- 3M, 6M, 12M, 24M, 5Y, and custom-date cash forecasts
- Financial Calendar with daily net cash flow
- Goals linked to total cash, a specific account, or manual progress
- Sinking funds with weekly/monthly contribution requirements
- Automatic sinking-fund suggestions for large upcoming annual/one-time expenses
- What-if scenario planning with monthly income/expense changes and one-time cash changes
- Financial Radar insights for runway risk, upcoming large expenses, reconciliation, categories, ending payments, goals, and savings rate
- Category spending dashboard and annualized recurring-commitment summary
- JSON backup/restore with v2/v3 migration support
- Light/dark themes and responsive desktop/mobile UI

## Architecture

```text
index.html
css/
  app.css
js/
  app.js
  categories.js
  charts.js
  constants.js
  forecast.js
  insights.js
  planning.js
  recurrence.js
  store.js
  utils.js
tests/
  import.test.mjs
  recurrence.test.mjs
  v4.test.mjs
DESIGN.md
```

The application has no runtime dependencies, build step, database, or server requirement.

## Local development

The app uses ES modules, so serve the repository over HTTP rather than opening `index.html` with `file://`.

```bash
python -m http.server 8000
```

## Tests

Requires Node.js 20+.

```bash
npm test
```

CI performs syntax validation and regression tests covering migration, recurring dates, month ends, leap years, occurrence overrides, account normalization, actual-vs-planned tracking, goals, sinking funds, and scenarios.

## GitHub Pages

The repository is published from `main` through GitHub Pages and uses relative asset paths, so it works as a project site:

```text
https://USERNAME.github.io/Finance-Planner/
```

## Data model and migration

v4 intentionally continues using the `planner_v2` localStorage key so existing users migrate automatically. Before every save, the prior value is retained as `planner_v2_backup`.

When migrating from v3, the canonical `balances` object is used to create clean Checking and Savings account records. This avoids preserving stale duplicate account snapshots from older backups.

Blank categories are auto-classified using description-based rules. Existing explicit categories are preserved when valid. v2 unified `items` remains authoritative over stale legacy arrays when both are present.

Actual-vs-planned tracking begins from a known checkpoint: the date v4 first migrates the data and the cash balance at that moment. Historical bank activity is not invented or reconstructed.

## Privacy

The repository contains application code only. Do **not** commit personal exported finance JSON files to this public repository. Backups should remain local/private unless intentionally shared.
