# Finance Planner

A static, local-first personal finance forecasting app designed for GitHub Pages.

## What it does

- Tracks checking and savings starting balances
- Tracks one-time, weekly, bi-weekly, monthly, and yearly income/expenses
- Projects future cash balance across preset or custom horizons
- Shows upcoming cash flow and the first projected negative-balance date
- Exports/imports JSON backups
- Stores finance data locally in the browser
- Supports light and dark themes

## Architecture

```text
index.html
css/
  app.css
js/
  app.js
  charts.js
  constants.js
  forecast.js
  recurrence.js
  store.js
  utils.js
tests/
  recurrence.test.mjs
DESIGN.md
```

No build step or server is required for the application itself.

## Local development

Because the app uses ES modules, serve the repository from a local HTTP server rather than opening `index.html` directly with `file://`.

Examples:

```bash
python -m http.server 8000
```

or any static development server.

## Tests

Requires Node.js 20+.

```bash
npm test
```

The regression tests currently focus on calendar-sensitive recurrence logic, including same-day transactions, month-end dates, leap years, and end dates.

## GitHub Pages

Publish the repository root from the `main` branch. The app uses relative paths and is compatible with project-site URLs such as:

```text
https://USERNAME.github.io/Finance-Planner/
```

## Data migration

v3 continues to use the existing `planner_v2` localStorage key and migrates prior Finance Planner data in place. A previous copy is retained in `planner_v2_backup` whenever new data is saved.

Before switching browsers or devices, export a JSON backup from Settings.
