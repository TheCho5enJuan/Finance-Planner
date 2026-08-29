# Finance Planner v5

A static, local-first personal finance **Financial Intelligence Center** designed for GitHub Pages. All financial data stays in browser storage unless the user explicitly exports a backup.

## Operating model

Finance Planner is intentionally **not** a transaction ledger. Routine use is:

1. Maintain planned recurring and one-time income/expenses only when the plan changes.
2. Periodically click **Update balances** and enter the current account totals.
3. Let v5 learn from the gap between the plan and those real balance snapshots.

No manual transaction reconciliation or bank-transaction import is required.

## What v5 does

- Multi-account cash balances with checking, savings, cash, and optional additional accounts
- One-time, weekly, bi-weekly, monthly, and yearly planned income/expenses
- Automatic transaction categorization with editable categories
- Calendar-safe recurring forecasts and month-end handling
- 3M, 6M, 12M, 24M, 5Y, and custom-date cash forecasts
- Automatic balance-history snapshots whenever balances are updated
- Forecast-accuracy measurement from balance history
- Learned estimate of unmodeled/discretionary spending
- Adaptive 12-month forecast with confidence range
- Actual cash trend and observed monthly cash-growth pace
- Conservative **Safe to spend** calculation
- Automatic reserve for major one-time/yearly obligations
- Configurable emergency reserve measured in months of recurring expenses
- Temporary **Can I afford this?** purchase-impact calculator
- Financial Calendar with daily planned net cash flow
- Goals linked to total cash, a specific account, or manual progress
- Goal completion outlook based on observed balance-growth pace
- Sinking funds with weekly/monthly contribution requirements
- Automatic sinking-fund suggestions for large upcoming annual/one-time expenses
- What-if scenario planning
- Financial health dashboard with transparent component metrics
- Recurring-expense optimizer with exact five-year forecast comparisons
- JSON backup/restore with v2/v3/v4/v5 migration support
- Light/dark themes and responsive desktop/mobile UI

## Architecture

```text
index.html
css/
  app.css
  v5.css
js/
  app.js
  v5.js
  intelligence.js
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
  v5-intelligence.test.mjs
DESIGN.md
```

The application has no runtime dependencies, build step, database, bank connection, or server requirement.

## V5 intelligence formulas

### Balance snapshots

Each balance check-in stores the date, combined cash, and per-account balances. If a prior snapshot exists, Finance Planner calculates what the balance *should* have been based on planned cash flow between the two check-ins.

### Forecast variance

```text
expected balance = previous actual balance + planned net cash flow
variance         = new actual balance - expected balance
```

A negative variance means cash grew less than the plan predicted. Finance Planner does not require the user to explain which purchases caused the difference.

### Learned spending buffer

V5 converts historical forecast variance into a monthly rate. The median monthly shortfall becomes the learned unmodeled-spending buffer. Using the median reduces the effect of one unusual check-in.

### Adaptive forecast

When at least one historical interval exists, the plan forecast is adjusted by the learned monthly shortfall. Forecast uncertainty comes from the historical dispersion of monthly forecast errors and is shown as a confidence range. Until enough history exists, the normal plan forecast remains authoritative and v5 displays a learning state.

### Safe to spend

```text
safe to spend = current cash
              - major obligations inside 12 months
              - emergency reserve
```

Major obligations are large one-time or yearly expenses above the configurable threshold. The emergency reserve defaults to three months of recurring expenses and can be changed in Settings.

This is intentionally conservative and is a planning indicator, not financial advice.

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

CI performs syntax validation and regression tests covering migration, recurring dates, month ends, leap years, plan-first forecasting, account normalization, goals, sinking funds, scenarios, v5 balance history, forecast learning, safe-to-spend reserves, adaptive forecasts, and purchase impact.

## GitHub Pages

The repository is published from `main` through GitHub Pages and uses relative asset paths, so it works as a project site:

```text
https://USERNAME.github.io/Finance-Planner/
```

## Data model and migration

v5 intentionally continues using the `planner_v2` localStorage key so existing users migrate automatically. Before every save, the prior value is retained as `planner_v2_backup`.

V5 preserves the modern multi-account model from v4. Balance-history intelligence is stored inside `settings.intelligence`, so it is included in normal JSON exports rather than being hidden in a separate browser database.

When migrating older v2/v3 backups, canonical summary balances are used to create clean Checking and Savings records. Blank categories are auto-classified using description-based rules. v2 unified `items` remains authoritative over stale legacy arrays when both are present.

## Privacy

The repository contains application code only. Do **not** commit personal exported finance JSON files to this public repository. Backups should remain local/private unless intentionally shared.
