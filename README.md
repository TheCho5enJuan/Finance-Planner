# Finance Planner v5.4

A static, local-first personal finance planner designed for GitHub Pages. Finance Planner is intentionally **not** a transaction ledger: users maintain the plan when it changes, periodically update account balances, and let the application learn from the difference between the plan and those real balance check-ins.

## Operating model

Routine use is deliberately low maintenance:

1. Maintain planned recurring and one-time income/expenses only when the plan changes.
2. Periodically click **Update balances** and enter current account totals.
3. Let Finance Planner compare those real balance snapshots with the plan and improve the adaptive forecast.

No manual transaction reconciliation or bank-transaction import is required.

## Major features

- Multi-account balances with checking, savings, cash, investments, and additional account types
- One-time, weekly, bi-weekly, monthly, and yearly planned income/expenses
- Editable spending categories and 12-month category intelligence
- Calendar-safe recurring forecasts and month-end handling
- 3M, 6M, 12M, 24M, 5Y, and custom-date forecasts
- Automatic balance-history snapshots on **Update balances**
- Forecast-accuracy measurement and learned estimate of spending not represented in the formal plan
- Adaptive forecast with confidence range
- Balance trend and observed monthly cash-growth pace
- Conservative **Safe to spend** calculation
- Automatic reserve for major one-time/yearly obligations
- Configurable emergency reserve measured in months of recurring expenses
- Temporary **Can I afford this?** purchase-impact calculator
- Cash-flow calendar with monthly summaries and category breakdowns
- Goals, sinking funds, suggested funds, and what-if scenarios
- Financial-health signals with transparent calculations
- Recurring-expense optimizer with exact five-year comparisons
- JSON backup/restore with older-backup migration support
- Optional Google Drive backup using the narrow `drive.file` OAuth scope
- Optional **Ask ChatGPT** explanations for whole tabs and selected graphs/cards
- Plain-language help throughout the application
- Light/dark themes and responsive desktop/mobile UI

## V5.4 Ask ChatGPT

Finance Planner performs the financial calculations itself. The Ask ChatGPT feature creates a compact, purpose-built summary of the selected page or section so ChatGPT can explain those already-calculated values in plain language.

Available actions include page-level analysis for Dashboard, Calendar, Plan, Insights, Expenses, Income, and Settings, plus focused prompts for Adaptive Forecast, Categories, Things to Watch, Purchase Check, Goals, Sinking Funds, What-if Scenario, Balance History, and other analytical sections.

Before leaving Finance Planner, the user sees:

- the exact summary that will be shared;
- an editable question;
- Synopsis, Explain, Analyze, and Next steps modes;
- the complete generated prompt;
- **Copy prompt** and **Open in ChatGPT** choices.

No OpenAI API key or backend is used. **Open in ChatGPT** constructs a `https://chatgpt.com/?q=...` link only after the user explicitly presses the button. Because the prompt is part of that outbound URL, the selected summary may appear in browser history. The app therefore sends a compact derived context instead of serializing the Finance Planner JSON.

## Google Drive backup

Google Drive backup is optional. Finance Planner uses Google Identity Services in the browser and requests only:

```text
https://www.googleapis.com/auth/drive.file
```

The OAuth access token is kept in memory only. Finance Planner does not persist a refresh token, Google client secret, or Drive file ID. The backup is rediscovered with private Drive `appProperties`, and content hashes are used to stop before a browser/Drive conflict can be silently overwritten.

## Architecture

```text
index.html
privacy.html
terms.html
css/
  app.css
  v5.css
  v51.css
  v51-insights.css
  v52-clarity.css
  v53-drive.css
  v54-chatgpt.css
js/
  app.js
  v5.js
  v51-ui.js
  v51-insights.js
  v51-layout.js
  v52-clarity.js
  v52-health-copy.js
  v53-drive.js
  v53-legal.js
  v54-chatgpt.js
  v54-ai-core.js
  cloud-backup-core.js
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
  *.test.mjs
DESIGN.md
```

The application has no build step, database, bank connection, or developer-operated backend. Google Drive and ChatGPT are optional browser-initiated third-party integrations.

## Core intelligence formulas

### Balance snapshots

Each balance check-in stores the date, combined balance, and per-account balances. If a prior snapshot exists, Finance Planner calculates what the balance should have been based on planned cash flow between the two check-ins.

### Forecast variance

```text
expected balance = previous actual balance + planned net cash flow
variance         = new actual balance - expected balance
```

A negative variance means the real balance grew less than the plan predicted. Finance Planner does not require the user to explain individual purchases.

### Learned spending buffer

Historical forecast variance is normalized into a monthly rate. The median monthly shortfall becomes the learned estimate of spending not represented in the formal plan. Using the median reduces the effect of a single unusual interval.

### Adaptive forecast

When balance history exists, the normal plan forecast can be adjusted by the learned monthly shortfall. Forecast uncertainty is based on historical dispersion of monthly forecast errors and is shown as a confidence range. Until enough history exists, the normal plan remains the primary forecast.

### Safe to spend

```text
safe to spend = current balance
              - major obligations inside 12 months
              - emergency reserve
```

Major obligations are large one-time or yearly expenses above the configurable threshold. The emergency reserve defaults to three months of recurring expenses and can be changed in Settings.

This is intentionally conservative and is a planning indicator, not professional financial advice.

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

CI performs syntax validation and regression tests covering migration, recurring dates, forecasting, goals, sinking funds, scenarios, balance history, forecast learning, safe-to-spend reserves, adaptive forecasts, purchase impact, UI contracts, Google Drive security/conflicts, legal-page coverage, and Ask ChatGPT privacy/context behavior.

## GitHub Pages

The repository is published from `main` through GitHub Pages and uses relative asset paths:

```text
https://thecho5enjuan.github.io/Finance-Planner/
```

## Data and privacy

The working financial dataset remains in the user's browser by default using the existing `planner_v2` localStorage key. Before each save, the prior value is retained as `planner_v2_backup`.

Google Drive receives financial data only when the user connects/uses the optional backup feature. ChatGPT receives only the previewed summary when the user explicitly chooses **Open in ChatGPT**. The repository contains application code only; personal exported finance JSON files should never be committed to this public repository.

See [Privacy Policy](./privacy.html) and [Terms of Service](./terms.html) for the public data-handling disclosures.
