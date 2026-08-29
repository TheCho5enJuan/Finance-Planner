import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrences } from '../js/recurrence.js';
import { toISODateLocal } from '../js/utils.js';

const dates = (item, from, to) => [...occurrences(item, from, to)].map(toISODateLocal);

test('includes a one-time transaction occurring today', () => {
  assert.deepEqual(
    dates({ date: '2026-08-29', endDate: '', frequency: 'once' }, '2026-08-29', '2026-08-29'),
    ['2026-08-29']
  );
});

test('includes a recurring transaction occurring on the forecast start date', () => {
  assert.deepEqual(
    dates({ date: '2026-08-29', endDate: '', frequency: 'monthly' }, '2026-08-29', '2026-10-29'),
    ['2026-08-29', '2026-09-29', '2026-10-29']
  );
});

test('clamps Jan 31 monthly recurrence to February month-end then restores anchor day', () => {
  assert.deepEqual(
    dates({ date: '2026-01-31', endDate: '', frequency: 'monthly' }, '2026-01-01', '2026-04-30'),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']
  );
});

test('clamps leap-day yearly recurrence to February month-end', () => {
  assert.deepEqual(
    dates({ date: '2024-02-29', endDate: '', frequency: 'yearly' }, '2024-01-01', '2028-03-01'),
    ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']
  );
});

test('honors inclusive endDate', () => {
  assert.deepEqual(
    dates({ date: '2026-01-01', endDate: '2026-03-01', frequency: 'monthly' }, '2026-01-01', '2026-06-01'),
    ['2026-01-01', '2026-02-01', '2026-03-01']
  );
});
