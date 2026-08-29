import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

test('every literal DOM id referenced by app.js exists in index.html', () => {
  const refs = new Set([...app.matchAll(/["'`]#([A-Za-z0-9_-]+)["'`]/g)].map(match => match[1]));
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  const missing = [...refs].filter(id => !ids.has(id));
  assert.deepEqual(missing, []);
});

test('simple balance-check-in UX does not expose reconciliation controls', () => {
  assert.doesNotMatch(html, /Reconcile occurrence|Actual vs planned baseline|Save status/i);
  assert.match(html, /Update balances/i);
});
