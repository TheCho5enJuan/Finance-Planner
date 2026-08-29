# Finance Planner Design System

Finance Planner v3 uses an institutional financial-product design language: calm, direct, numeric, and deliberately low-noise.

The system is informed by the financial UI patterns documented in VoltAgent's `awesome-design-md`, especially the Coinbase and Stripe analyses, but is implemented with original styling and system fonts.

## Principles

1. **Money first.** Balances, cash flow, and dates dominate visual hierarchy.
2. **One brand voltage.** Blue is reserved for primary actions and active navigation.
3. **Semantic color is functional.** Green means positive cash movement; red means negative/risk. Do not use them decoratively.
4. **Minimal elevation.** Prefer borders and surface changes to heavy shadows.
5. **Tabular numbers.** Financial values should use tabular or monospace figures where alignment matters.
6. **Local-first trust.** The interface should make clear that finance data is stored in the browser and can be exported by the user.
7. **Responsive by default.** Desktop uses a persistent rail; mobile uses a bottom navigation bar and single-column content.

## Tokens

### Core colors

- Brand: `#0052ff`
- Brand active: `#003ecc`
- Positive: `#0a9f68` light / `#27c486` dark
- Negative: `#cf3344` light / `#ff6676` dark
- Light canvas: `#f6f7f9`
- Dark canvas: `#0b0d10`

### Radius

- Inputs: 8px
- Cards: 18px
- Hero: 24px
- Buttons and filters: pill

### Spacing

Use an 8-ish pixel rhythm: 8, 12, 16, 20, 24, 30, 42, 54.

## Components

### Primary button

Pill-shaped, brand blue, white text, restrained hover darkening. Use for the single dominant action in a section.

### Cards

Flat surface, 1px hairline border, subtle shadow only where separation is necessary.

### Financial KPIs

Keep labels small and muted. Values are large, tabular, and semantically colored only when the sign has meaning.

### Tables

Dense but readable. Headers use compact uppercase labels. Amounts and balances align right and use tabular figures.

### Forecast controls

Range selectors are pill controls. A custom target date switches the forecast into explicit-date mode rather than mutating a saved range into a fixed date.

## Accessibility

- Every interactive element must be keyboard reachable.
- Use native buttons, inputs, selects, and `dialog` where possible.
- Maintain visible focus rings.
- Do not rely on color alone for transaction type or status.
- Respect `prefers-reduced-motion`.

## Architecture

UI styles live in `css/app.css`. Business logic is separated from rendering:

- `js/store.js` — persistence, migration, validation, mutations
- `js/recurrence.js` — recurrence rules and calendar clamping
- `js/forecast.js` — balance simulation and totals
- `js/charts.js` — canvas chart rendering
- `js/app.js` — UI composition and event binding

Do not move business rules back into `index.html`.
