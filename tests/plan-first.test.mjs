import test from 'node:test';
import assert from 'node:assert/strict';

const { itemsInRange } = await import('../js/forecast.js');

test('forecast ignores old occurrence overrides unless explicitly requested', () => {
  const data = {
    accounts: [{ id: 'checking', balance: 1000 }],
    expenses: [{ id: 'e1', description: 'Groceries', amount: 100, date: '2026-08-29', endDate: '', frequency: 'once', category: 'groceries', active: true }],
    incomes: [],
    occurrenceOverrides: {
      'e1@2026-08-29': { status: 'skipped' }
    }
  };

  const planned = itemsInRange(data, '2026-08-29', '2026-08-29');
  assert.equal(planned.length, 1);
  assert.equal(planned[0].amount, -100);
  assert.equal(planned[0].status, 'planned');

  const withOverrides = itemsInRange(data, '2026-08-29', '2026-08-29', { includeOverrides: true });
  assert.equal(withOverrides[0].amount, 0);
  assert.equal(withOverrides[0].status, 'skipped');
});
