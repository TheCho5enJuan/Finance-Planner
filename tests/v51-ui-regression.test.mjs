import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { placeAfterIfNeeded, shouldStopInsightsObserver } from '../js/v51-layout.js';

const ui = await readFile(new URL('../js/v51-ui.js', import.meta.url), 'utf8');
const insights = await readFile(new URL('../js/v51-insights.js', import.meta.url), 'utf8');
const insightsCss = await readFile(new URL('../css/v51-insights.css', import.meta.url), 'utf8');
const layoutFix = await readFile(new URL('../js/layout-fix.js', import.meta.url), 'utf8');
const constants = await readFile(new URL('../js/constants.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function makeSiblingFixture(names) {
  const parent = { children: [] };
  const nodes = Object.fromEntries(names.map(name => [name, { name, parentElement: parent }]));
  parent.children = names.map(name => nodes[name]);
  for (const node of parent.children) {
    Object.defineProperty(node, 'nextElementSibling', {
      get() {
        const index = parent.children.indexOf(node);
        return index >= 0 ? parent.children[index + 1] || null : null;
      }
    });
    node.after = other => {
      const currentIndex = parent.children.indexOf(other);
      if (currentIndex >= 0) parent.children.splice(currentIndex, 1);
      const index = parent.children.indexOf(node);
      parent.children.splice(index + 1, 0, other);
    };
  }
  return { parent, nodes };
}

test('current version metadata stays aligned', () => {
  assert.equal(pkg.version, '5.2.0');
  assert.match(constants, /APP_VERSION\s*=\s*'5\.2\.0'/);
  assert.match(layoutFix, /DISPLAY_VERSION\s*=\s*'5\.2\.0'/);
  assert.match(layoutFix, /v52-clarity\.js\?v=5\.2\.0/);
});

test('Insights layout helper is idempotent and does not churn the DOM', () => {
  const { parent, nodes } = makeSiblingFixture(['head', 'history', 'health', 'categories']);
  assert.equal(placeAfterIfNeeded(nodes.head, nodes.health), true);
  assert.deepEqual(parent.children.map(node => node.name), ['head', 'health', 'history', 'categories']);
  assert.equal(placeAfterIfNeeded(nodes.head, nodes.health), false);
  assert.deepEqual(parent.children.map(node => node.name), ['head', 'health', 'history', 'categories']);
});

test('Insights observer only stops after the interactive category section exists', () => {
  assert.equal(shouldStopInsightsObserver({ health: {}, history: {}, categories: null }), false);
  assert.equal(shouldStopInsightsObserver({ health: {}, history: {}, categories: {} }), true);
  assert.match(insights, /observer\.disconnect\(\)/);
  assert.match(insights, /placeAfterIfNeeded\(head, health\)/);
  assert.doesNotMatch(insights, /head\.after\(health\);\s*health\.after\(history\)/);
});

test('Category Intelligence cards are actionable controls that change selection', () => {
  assert.match(ui, /const button = el\('button', `v51-category-card/);
  assert.match(ui, /button\.type = 'button'/);
  assert.match(ui, /button\.onclick = \(\) => \{ selectedCategoryId = row\.id; renderCategoryExplorer\(\); \}/);
  assert.match(insightsCss, /\.v51-category-card\{[^}]*pointer-events:auto/);
  assert.match(insightsCss, /touch-action:manipulation/);
});

test('Adaptive Forecast follows custom and preset dashboard horizons', () => {
  assert.match(ui, /settings\.targetMode === 'date'/);
  assert.match(ui, /settings\.targetRangeDays/);
  assert.match(ui, /renderAdaptiveForSelectedRange\(\)/);
  for (const days of [90, 180, 365, 730, 1826]) assert.match(ui, new RegExp(`\\[${days},`));
});

test('Main charts expose mouse and drag inspection events', () => {
  assert.match(ui, /#balanceChart,#v5AdaptiveChart,#v5HistoryChart,#v5OptimizationChart/);
  assert.match(ui, /addEventListener\('pointerdown'/);
  assert.match(ui, /addEventListener\('pointermove'/);
  assert.match(ui, /addEventListener\('pointerup'/);
  assert.match(ui, /showChartTooltip/);
});

test('Calendar enhancement contract includes summary, categories, cash-flow days, and day markers', () => {
  assert.match(ui, /v51CalendarSummary/);
  assert.match(ui, /Top spending categories/);
  assert.match(ui, /Largest cash-flow days/);
  assert.match(ui, /v51-flow-dot income/);
  assert.match(ui, /v51-flow-dot expense/);
});

test('Insights hierarchy hides superseded legacy panels and preserves drill-down disclosures', () => {
  assert.match(insightsCss, /v51-legacy-insights\{display:none!important\}/);
  assert.match(insights, /Planning details/);
  assert.match(insights, /Recurring expense optimizer/);
  assert.match(insights, /v51CategoryExplorer/);
});

test('Dashboard category summary links into Insights', () => {
  assert.match(ui, /Explore category details/);
  assert.match(ui, /document\.querySelector\('\[data-view="insights"\]'\)\?\.click\(\)/);
});
