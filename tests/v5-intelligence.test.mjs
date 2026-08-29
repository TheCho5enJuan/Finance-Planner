import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); }
};

const { migrate } = await import('../js/store.js');
const {
  adaptiveForecast,
  balanceHistory,
  ensureIntelligenceState,
  forecastLearning,
  purchaseImpact,
  recordBalanceSnapshot,
  safeToSpend
} = await import('../js/intelligence.js');

test('v5 migration preserves the full modern account model', () => {
  const data = migrate({
    version: '5.0.0',
    accounts: [
      { id: 'daily', name: 'Daily Checking', type: 'checking', balance: 1234 },
      { id: 'reserve', name: 'College Reserve', type: 'savings', balance: 9876 },
      { id: 'cash', name: 'Cash', type: 'cash', balance: 250 }
    ]
  });
  assert.equal(data.accounts.length, 3);
  assert.equal(data.accounts[1].name, 'College Reserve');
  assert.equal(data.startingBalance, 11360);
});

test('balance check-ins calculate expected cash and forecast variance automatically', () => {
  const data = migrate({
    version: '5.0.0',
    accounts: [{ id: 'cash', name: 'Cash', type: 'checking', balance: 1000 }],
    expenses: [{ id: 'bill', description: 'Bill', amount: 100, date: '2026-09-05', frequency: 'once', category: 'utilities' }]
  });
  recordBalanceSnapshot(data, '2026-09-01T12:00:00Z');
  data.accounts[0].balance = 850;
  const second = recordBalanceSnapshot(data, '2026-09-10T12:00:00Z');
  assert.equal(second.expectedTotal, 900);
  assert.equal(second.variance, -50);
  assert.equal(balanceHistory(data).length, 2);
  const learning = forecastLearning(data);
  assert.ok(learning.monthlyUnmodeledSpend > 0);
  assert.ok(learning.accuracy > 0.9);
});

test('safe-to-spend reserves major obligations and emergency cash without manual actuals', () => {
  const data = migrate({
    version: '5.0.0',
    accounts: [{ id: 'cash', name: 'Cash', type: 'checking', balance: 20000 }],
    expenses: [
      { id: 'monthly', description: 'Recurring cost', amount: 1000, date: '2026-08-01', frequency: 'monthly', category: 'housing' },
      { id: 'tuition', description: 'Tuition', amount: 5000, date: '2026-10-01', frequency: 'once', category: 'education' }
    ]
  });
  ensureIntelligenceState(data).emergencyMonths = 3;
  const result = safeToSpend(data, 365);
  assert.equal(result.emergencyReserve, 3000);
  assert.equal(result.obligationReserve, 5000);
  assert.equal(result.safeToSpend, 12000);
});

test('adaptive forecast learns a persistent shortfall from balance history', () => {
  const data = migrate({
    version: '5.0.0',
    accounts: [{ id: 'cash', name: 'Cash', type: 'checking', balance: 1000 }],
    incomes: [{ id: 'pay', description: 'Pay', amount: 1000, date: '2026-08-01', frequency: 'monthly', category: 'income' }]
  });
  recordBalanceSnapshot(data, '2026-06-01T12:00:00Z');
  data.accounts[0].balance = 1600;
  recordBalanceSnapshot(data, '2026-07-01T12:00:00Z');
  data.accounts[0].balance = 2200;
  recordBalanceSnapshot(data, '2026-08-01T12:00:00Z');
  const learning = forecastLearning(data);
  assert.ok(learning.monthlyUnmodeledSpend > 300);
  const forecast = adaptiveForecast(data, new Date(2026, 10, 1), new Date(2026, 7, 1));
  assert.equal(forecast.adaptive, true);
  assert.ok(forecast.endBalance < forecast.plan.endBalance);
  assert.ok(forecast.lowerEnd <= forecast.endBalance);
  assert.ok(forecast.upperEnd >= forecast.endBalance);
});

test('purchase impact is temporary and reduces the adaptive forecast without changing the plan', () => {
  const data = migrate({
    version: '5.0.0',
    accounts: [{ id: 'cash', name: 'Cash', type: 'checking', balance: 10000 }],
    expenses: [{ id: 'cost', description: 'Monthly cost', amount: 500, date: '2026-08-01', frequency: 'monthly', category: 'other' }],
    incomes: [{ id: 'pay', description: 'Pay', amount: 1000, date: '2026-08-01', frequency: 'monthly', category: 'income' }]
  });
  const beforeCount = data.expenses.length;
  const result = purchaseImpact(data, 2500, '2026-09-15');
  assert.equal(data.expenses.length, beforeCount);
  assert.ok(result.endBalance < result.baselineEnd);
  assert.equal(result.amount, 2500);
  assert.ok(['low', 'moderate', 'high'].includes(result.risk));
});
