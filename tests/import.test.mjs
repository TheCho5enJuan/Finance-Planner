import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); }
};

const { migrate, validateImport } = await import('../js/store.js');

test('mixed v2 backups prefer unified items over stale legacy arrays', () => {
  const raw = {
    version: '2.0.33',
    balances: { checking: 2000, savings: 22000 },
    items: [
      { id: 'expense-1', kind: 'expense', description: 'Bolivia Trip', amount: 3000, startDate: '2026-12-01', endDate: '', frequency: 'once', active: true },
      { id: 'income-1', kind: 'income', description: 'Pay', amount: 1600, startDate: '2026-08-29', endDate: '', frequency: 'weekly', active: true },
      { id: 'expense-2', kind: 'expense', description: 'Grocery', amount: 100, startDate: '2025-10-06', endDate: '', frequency: 'biweekly', active: true }
    ],
    expenses: [{ id: 'expense-1', description: 'Bolivia Trip', amount: 5000, date: '2026-11-22', endDate: '', frequency: 'once' }],
    incomes: [{ id: 'income-1', description: 'Pay', amount: 1400, date: '2026-08-22', endDate: '', frequency: 'weekly' }]
  };

  const { data, diagnostics } = validateImport(raw);
  assert.equal(data.expenses.length, 2);
  assert.equal(data.incomes.length, 1);
  assert.equal(data.expenses.find(item => item.id === 'expense-1').amount, 3000);
  assert.equal(data.expenses.find(item => item.id === 'expense-1').date, '2026-12-01');
  assert.equal(data.expenses.find(item => item.id === 'expense-1').category, 'travel');
  assert.equal(data.expenses.find(item => item.id === 'expense-2').category, 'groceries');
  assert.equal(data.incomes[0].category, 'income');
  assert.equal(data.startingBalance, 24000);
  assert.equal('items' in data, false);
  assert.ok(diagnostics.some(message => message.includes('unified v2 transaction data')));
});

test('inactive unified items are not imported', () => {
  const data = migrate({ items: [
    { id: 'active', kind: 'expense', description: 'Active', amount: 10, startDate: '2026-08-29', frequency: 'once', active: true },
    { id: 'inactive', kind: 'expense', description: 'Inactive', amount: 20, startDate: '2026-08-29', frequency: 'once', active: false }
  ] });
  assert.deepEqual(data.expenses.map(item => item.id), ['active']);
});

test('legacy-only backups remain supported', () => {
  const { data } = validateImport({
    startingBalance: 500,
    expenses: [{ id: 'e1', description: 'Rent', amount: 100, date: '2026-09-01', frequency: 'monthly' }],
    incomes: [{ id: 'i1', description: 'Pay', amount: 200, date: '2026-09-02', frequency: 'weekly' }]
  });
  assert.equal(data.expenses.length, 1);
  assert.equal(data.incomes.length, 1);
  assert.equal(data.startingBalance, 500);
  assert.equal(data.accounts.length, 2);
});

test('v3 summary balances replace stale legacy account snapshots during v4 migration', () => {
  const data = migrate({
    version: '3.0.0',
    balances: { checking: 10361, savings: 23745 },
    accounts: [
      { id: 'stale-a', type: 'checking', balance: 16000 },
      { id: 'stale-b', type: 'checking', balance: 16000 }
    ]
  });
  assert.equal(data.startingBalance, 34106);
  assert.equal(data.accounts.length, 2);
  assert.deepEqual(data.accounts.map(account => account.balance), [10361, 23745]);
  assert.equal(data.accounts.some(account => account.id === 'stale-a'), false);
});

test('legacy goalBalance becomes a live total-cash goal', () => {
  const data = migrate({ version: '3.0.0', settings: { goalBalance: 50000 }, balances: { checking: 10000, savings: 20000 }, goals: [] });
  assert.equal(data.goals.length, 1);
  assert.equal(data.goals[0].targetAmount, 50000);
  assert.equal(data.goals[0].source, 'cash');
});
