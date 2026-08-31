import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/v541-mobile-nav.css', import.meta.url), 'utf8');

function mobileNavMarkup(source) {
  const match = source.match(/<nav class="mobile-nav"[\s\S]*?<\/nav>/);
  assert.ok(match, 'mobile navigation must exist');
  return match[0];
}

test('mobile navigation exposes every primary Finance Planner tab', () => {
  const nav = mobileNavMarkup(html);
  const views = [...nav.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(views, ['overview', 'calendar', 'plan', 'insights', 'expenses', 'incomes', 'settings']);
  assert.match(nav, />Expenses</);
  assert.match(nav, />Income</);
});

test('seven mobile tabs remain visible without requiring horizontal discovery', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /min-height:\s*48px/);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)/);
});

test('mobile navigation hotfix stylesheet is loaded after the base styles', () => {
  const base = html.indexOf('./css/app.css?v=5.4.0');
  const hotfix = html.indexOf('./css/v541-mobile-nav.css?v=5.4.1');
  assert.ok(base >= 0);
  assert.ok(hotfix > base);
});
