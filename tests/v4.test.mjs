import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); }
};

const { migrate } = await import('../js/store.js');
const { actualVsPlanned, combinedBalance, itemsInRange, simulateBalance } = await import('../js/forecast.js');
const { fundMetrics, goalMetrics, suggestedFunds } = await import('../js/planning.js');
const { addDays, todayISO } = await import('../js/utils.js');

test('completed and skipped occurrence overrides change the forecast without changing the base transaction', () => {
  const data = migrate({
    version: '4.0.0',
    accounts: [{ id: 'cash', name: 'Cash', type: 'checking', balance: 1000 }],
    expenses: [
      { id: 'bill', description: 'Utility', amount: 100, date: '2026-09-01', frequency: 'once', category: 'utilities' },
      { id: 'skip', description: 'Shopping', amount: 50, date: '2026-09-02', frequency: 'once', category: 'shopping' }
    ],
    occurrenceOverrides: {
      'bill@2026-09-01': { status: 'completed', actualAmount: 120, actualDate: '2026-09-01', accountId: 'cash' },
      'skip@2026-09-02': { status: 'skipped' }
    }
  });
  const result = simulateBalance(data, new Date(2026, 8, 3), new Date(2026, 7, 31));
  assert.equal(result.endBalance, 880);
  assert.equal(data.expenses[0].amount, 100);
  assert.equal(result.events.find(event => event.id === 'bill').status, 'completed');
  assert.equal(result.events.find(event => event.id === 'skip').amount, 0);
});

test('actual-vs-planned uses the saved tracking checkpoint and current account cash', () => {
  const data = migrate({
    version: '4.0.0',
    settings: { trackingStartDate: '2026-08-01', trackingStartBalance: 1000 },
    accounts: [{ id: 'cash', name: 'Cash', type: 'checking', balance: 950 }],
    expenses: [{ id: 'bill', description: 'Utility', amount: 100, date: '2026-08-10', frequency: 'once', category: 'utilities' }]
  });
  const result = actualVsPlanned(data, new Date(2026, 7, 20));
  assert.equal(result.expectedBalance, 900);
  assert.equal(result.actualBalance, 950);
  assert.equal(result.variance, 50);
  assert.equal(result.unreconciled, 1);
});

test('cash-linked goals use live account balances', () => {
  const data = migrate({ version: '4.0.0', accounts: [{ id: 'a', name: 'Checking', type: 'checking', balance: 12000 }, { id: 'b', name: 'Savings', type: 'savings', balance: 18000 }] });
  const metrics = goalMetrics(data, { source: 'cash', targetAmount: 50000, currentAmount: 0 });
  assert.equal(combinedBalance(data), 30000);
  assert.equal(metrics.current, 30000);
  assert.equal(metrics.remaining, 20000);
  assert.equal(metrics.progress, 0.6);
});

test('sinking fund calculates remaining weekly and monthly requirements', () => {
  const metrics = fundMetrics({ targetAmount: 1200, reservedAmount: 200, dueDate: '2026-12-31' }, new Date(2026, 7, 31));
  assert.equal(metrics.remaining, 1000);
  assert.ok(metrics.weeklyRequired > 0);
  assert.ok(metrics.monthlyRequired > 0);
});

test('large future once/yearly expenses generate sinking-fund suggestions', () => {
  const data = migrate({
    version: '4.0.0',
    expenses: [
      { id: 'tuition', description: 'Providence College Tuition', amount: 5000, date: todayISO(), frequency: 'yearly' },
      { id: 'small', description: 'Netflix', amount: 20, date: todayISO(), frequency: 'monthly' }
    ]
  });
  const suggestions = suggestedFunds(data, 365);
  assert.equal(suggestions.some(item => item.expenseId === 'tuition'), true);
  assert.equal(suggestions.some(item => item.expenseId === 'small'), false);
});

test('enabled one-time scenario changes projected balance while baseline remains unchanged', () => {
  const oneTimeDate = todayISO();
  const data = migrate({
    version: '4.0.0',
    accounts: [{ id: 'cash', name: 'Cash', type: 'checking', balance: 1000 }],
    scenario: { enabled: true, oneTimeDelta: -250, oneTimeDate, monthlyIncomeDelta: 0, monthlyExpenseDelta: 0 }
  });
  const to = addDays(new Date(), 10);
  const baseline = simulateBalance(data, to, new Date(), { includeScenario: false });
  const scenario = simulateBalance(data, to, new Date(), { includeScenario: true });
  assert.equal(baseline.endBalance, 1000);
  assert.equal(scenario.endBalance, 750);
});
