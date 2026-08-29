import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const clarity = await readFile(new URL('../js/v52-clarity.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/v52-clarity.css', import.meta.url), 'utf8');
const layout = await readFile(new URL('../js/layout-fix.js', import.meta.url), 'utf8');

const helpIds = [...clarity.matchAll(/\['([a-z0-9-]+)','#[^']+','[^']+'/g)].map(match => match[1]);

test('V5.2 clarity layer is loaded and styled', () => {
  assert.match(layout, /import '\.\/v52-clarity\.js\?v=5\.2\.0'/);
  assert.match(clarity, /export const VERSION = '5\.2\.0'/);
  assert.match(clarity, /v52-clarity\.css\?v=5\.2\.0/);
  assert.match(css, /\.v52-info-button/);
  assert.match(css, /\.v52-help-dialog/);
});

test('every primary tab receives plain-language copy', () => {
  for (const view of ['overview', 'calendar', 'plan', 'insights', 'expenses', 'incomes', 'settings']) {
    assert.match(clarity, new RegExp(`#view-${view}`), `${view} is missing V5.2 copy coverage`);
  }
  for (const phrase of [
    'Your financial picture',
    'See which days money is expected to come in or go out',
    'Plan ahead',
    'See what your balance history and planned cash flow are telling you',
    'Bills and spending you expect',
    'Money you expect to receive',
    'Manage accounts, categories, forecast assumptions, backups, and display preferences'
  ]) assert.match(clarity, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('help coverage includes every major graph, card group, and planning feature', () => {
  const required = [
    'current-balance','planned-ending','income-12','spending-12','change-12','change-30',
    'adaptive','safe','large-bills','emergency','accuracy','categories-dashboard','radar','purchase',
    'quick-add','upcoming','calendar','goals','funds','suggested-funds','scenario','snapshot','history',
    'category-details','planning-details','optimizer','expenses','income','forecast-settings','accounts',
    'category-settings','appearance','backup','local-data'
  ];
  assert.ok(helpIds.length >= required.length, `expected at least ${required.length} help topics, found ${helpIds.length}`);
  assert.equal(new Set(helpIds).size, helpIds.length, 'help topic IDs must be unique');
  for (const id of required) assert.ok(helpIds.includes(id), `missing help topic: ${id}`);
});

test('help controls are accessible and use one reusable dialog', () => {
  assert.match(clarity, /aria-label/);
  assert.match(clarity, /aria-haspopup/);
  assert.match(clarity, /aria-controls/);
  assert.match(clarity, /id = 'v52HelpDialog'/);
  assert.match(clarity, /showModal\(\)/);
  assert.match(clarity, /How to use it/);
  assert.match(clarity, /event\.target\.closest\('\.v52-info-button'\)/);
});

test('clarity updates preserve help buttons instead of replacing their containers', () => {
  assert.match(clarity, /:scope > \.v52-info-button/);
  assert.match(clarity, /ownText\(node\)/);
  assert.doesNotMatch(clarity, /replaceChildren\(/);
});

test('plain-language labels replace the most technical user-facing terms', () => {
  for (const phrase of [
    'Current net balance',
    'Planned ending balance',
    'Planned balance change',
    'Things to watch',
    'Emergency cushion',
    'Typical spending not in your plan',
    'Balance over time',
    'Spending by category',
    'Recurring cost what-if',
    'Forecast settings'
  ]) assert.match(clarity, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
