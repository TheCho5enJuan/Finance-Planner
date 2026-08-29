import { APP_VERSION, STORAGE_KEY, STORAGE_BACKUP_KEY } from './constants.js';
import { ensureCategories, suggestCategory } from './categories.js';
import { parseAmount, parseISODate, sanitizeDescription, sanitizeFrequency, todayISO, uuid } from './utils.js';

function defaultAccounts() {
  return [
    { id: 'acct-checking', name: 'Checking', type: 'checking', balance: 0 },
    { id: 'acct-savings', name: 'Savings', type: 'savings', balance: 0 }
  ];
}

export function defaults() {
  return {
    version: APP_VERSION,
    settings: {
      theme: 'dark',
      targetMode: 'range',
      targetRangeDays: 365,
      targetDate: '',
      trackingStartDate: todayISO(),
      trackingStartBalance: 0
    },
    startingBalance: 0,
    balances: { checking: 0, savings: 0 },
    accounts: defaultAccounts(),
    categories: ensureCategories([]),
    expenses: [],
    incomes: [],
    occurrenceOverrides: {},
    goals: [],
    funds: [],
    scenario: {
      enabled: false,
      name: 'Working scenario',
      monthlyIncomeDelta: 0,
      monthlyExpenseDelta: 0,
      oneTimeDelta: 0,
      oneTimeDate: ''
    },
    rules: []
  };
}

function cleanType(value, fallback = 'cash') {
  const type = String(value || fallback).toLowerCase();
  return ['checking', 'savings', 'cash', 'investment', 'other'].includes(type) ? type : fallback;
}

function normalizeAccount(raw = {}, index = 0) {
  return {
    id: String(raw.id || `acct-${uuid()}`),
    name: String(raw.name || `Account ${index + 1}`).trim() || `Account ${index + 1}`,
    type: cleanType(raw.type),
    balance: parseAmount(raw.balance) ?? 0
  };
}

function balancesFromAccounts(accounts = []) {
  let checking = 0;
  let savings = 0;
  for (const account of accounts) {
    const amount = Number(account.balance || 0);
    if (account.type === 'savings') savings += amount;
    else checking += amount;
  }
  return { checking, savings };
}

function legacyBalances(raw) {
  if (raw?.balances && typeof raw.balances === 'object') {
    return {
      checking: Number(raw.balances.checking || 0),
      savings: Number(raw.balances.savings || 0)
    };
  }
  return { checking: Number(raw?.startingBalance || 0), savings: 0 };
}

function normalizedAccounts(raw) {
  const isV4 = String(raw?.version || '').startsWith('4.');
  if (isV4 && Array.isArray(raw.accounts) && raw.accounts.length) return raw.accounts.map(normalizeAccount);
  const balances = legacyBalances(raw);
  return [
    { id: 'acct-checking', name: 'Checking', type: 'checking', balance: balances.checking },
    { id: 'acct-savings', name: 'Savings', type: 'savings', balance: balances.savings }
  ];
}

function normalizeItem(raw = {}, type = 'expense', categoryIds = new Set()) {
  const suggested = suggestCategory(raw.description, type);
  const requestedCategory = typeof raw.category === 'string' ? raw.category.trim() : '';
  return {
    id: String(raw.id || uuid()),
    description: sanitizeDescription(raw.description),
    amount: parseAmount(raw.amount) ?? 0,
    date: parseISODate(raw.date) ? raw.date : todayISO(),
    endDate: raw.endDate && parseISODate(raw.endDate) ? raw.endDate : '',
    frequency: sanitizeFrequency(raw.frequency),
    category: requestedCategory && categoryIds.has(requestedCategory) ? requestedCategory : suggested,
    accountId: typeof raw.accountId === 'string' ? raw.accountId : '',
    active: raw.active !== false
  };
}

function normalizeList(list, type, categories) {
  const ids = new Set(categories.map(category => category.id));
  return Array.isArray(list) ? list.map(item => normalizeItem(item, type, ids)) : [];
}

function convertUnifiedItem(raw = {}) {
  return {
    id: raw.id,
    description: raw.description,
    amount: raw.amount,
    date: raw.startDate,
    endDate: raw.endDate || '',
    frequency: raw.frequency,
    category: typeof raw.categoryId === 'string' ? raw.categoryId : (raw.category || ''),
    accountId: raw.accountId || '',
    active: raw.active !== false
  };
}

function transactionSource(raw) {
  if (Array.isArray(raw?.items) && raw.items.length) {
    const active = raw.items.filter(item => item && item.active !== false);
    return {
      format: 'items',
      expenses: active.filter(item => item.kind === 'expense').map(convertUnifiedItem),
      incomes: active.filter(item => item.kind === 'income').map(convertUnifiedItem)
    };
  }
  return {
    format: 'legacy',
    expenses: Array.isArray(raw?.expenses) ? raw.expenses : [],
    incomes: Array.isArray(raw?.incomes) ? raw.incomes : []
  };
}

function normalizeGoal(raw = {}) {
  const source = ['cash', 'account', 'manual'].includes(raw.source) ? raw.source : 'manual';
  return {
    id: String(raw.id || uuid()),
    name: String(raw.name || 'Financial goal').trim() || 'Financial goal',
    targetAmount: Math.max(0, parseAmount(raw.targetAmount) ?? parseAmount(raw.amount) ?? 0),
    source,
    currentAmount: Math.max(0, parseAmount(raw.currentAmount) ?? 0),
    accountId: typeof raw.accountId === 'string' ? raw.accountId : '',
    targetDate: raw.targetDate && parseISODate(raw.targetDate) ? raw.targetDate : ''
  };
}

function normalizeFund(raw = {}) {
  return {
    id: String(raw.id || uuid()),
    name: String(raw.name || 'Sinking fund').trim() || 'Sinking fund',
    targetAmount: Math.max(0, parseAmount(raw.targetAmount) ?? 0),
    reservedAmount: Math.max(0, parseAmount(raw.reservedAmount) ?? 0),
    dueDate: raw.dueDate && parseISODate(raw.dueDate) ? raw.dueDate : '',
    linkedExpenseId: typeof raw.linkedExpenseId === 'string' ? raw.linkedExpenseId : '',
    accountId: typeof raw.accountId === 'string' ? raw.accountId : ''
  };
}

function normalizeScenario(raw = {}) {
  return {
    enabled: Boolean(raw.enabled),
    name: String(raw.name || 'Working scenario').trim() || 'Working scenario',
    monthlyIncomeDelta: Math.max(0, parseAmount(raw.monthlyIncomeDelta) ?? 0),
    monthlyExpenseDelta: Math.max(0, parseAmount(raw.monthlyExpenseDelta) ?? 0),
    oneTimeDelta: parseAmount(raw.oneTimeDelta) ?? 0,
    oneTimeDate: raw.oneTimeDate && parseISODate(raw.oneTimeDate) ? raw.oneTimeDate : ''
  };
}

function normalizeOverrides(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    const status = ['completed', 'skipped', 'planned'].includes(value.status) ? value.status : 'planned';
    out[key] = {
      status,
      actualAmount: parseAmount(value.actualAmount),
      actualDate: value.actualDate && parseISODate(value.actualDate) ? value.actualDate : '',
      accountId: typeof value.accountId === 'string' ? value.accountId : '',
      updatedAt: value.updatedAt || new Date().toISOString()
    };
  }
  return out;
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults();
  const base = defaults();
  const source = transactionSource(raw);
  const categories = ensureCategories(Array.isArray(raw.categories) ? raw.categories : []);
  const accounts = normalizedAccounts(raw);
  const balances = balancesFromAccounts(accounts);
  const settings = { ...base.settings, ...(raw.settings || {}) };

  if (!raw.settings?.targetMode) {
    settings.targetMode = raw.settings?.targetDate ? 'date' : 'range';
    settings.targetRangeDays = 365;
  }
  if (!raw.settings?.trackingStartDate || !parseISODate(raw.settings.trackingStartDate)) settings.trackingStartDate = todayISO();
  const rawTrackingBalance = raw.settings?.trackingStartBalance;
  if (rawTrackingBalance === null || typeof rawTrackingBalance === 'undefined' || !Number.isFinite(Number(rawTrackingBalance))) {
    settings.trackingStartBalance = balances.checking + balances.savings;
  }

  let goals = Array.isArray(raw.goals) ? raw.goals.map(normalizeGoal) : [];
  const legacyGoal = Number(raw.settings?.goalBalance || 0);
  if (!goals.length && legacyGoal > 0) {
    goals = [{
      id: 'goal-cash-reserve',
      name: 'Cash Reserve',
      targetAmount: legacyGoal,
      source: 'cash',
      currentAmount: 0,
      accountId: '',
      targetDate: ''
    }];
  }

  return {
    version: APP_VERSION,
    settings,
    startingBalance: balances.checking + balances.savings,
    balances,
    accounts,
    categories,
    expenses: normalizeList(source.expenses, 'expense', categories),
    incomes: normalizeList(source.incomes, 'income', categories),
    occurrenceOverrides: normalizeOverrides(raw.occurrenceOverrides),
    goals,
    funds: Array.isArray(raw.funds) ? raw.funds.map(normalizeFund) : [],
    scenario: normalizeScenario(raw.scenario),
    rules: Array.isArray(raw.rules) ? structuredClone(raw.rules) : []
  };
}

function validateList(list, label, diagnostics) {
  const valid = [];
  list.forEach((item, index) => {
    const validAmount = parseAmount(item?.amount) !== null;
    const validDate = Boolean(parseISODate(item?.date));
    if (!validAmount || !validDate) {
      diagnostics.push(`${label} ${index + 1} skipped: invalid ${!validAmount ? 'amount' : 'date'}.`);
      return;
    }
    const clean = { ...item };
    if (clean.endDate && !parseISODate(clean.endDate)) {
      diagnostics.push(`${label} ${index + 1}: invalid end date removed.`);
      clean.endDate = '';
    }
    valid.push(clean);
  });
  return valid;
}

export function validateImport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Backup must contain a JSON object.');
  const diagnostics = [];
  const source = transactionSource(raw);
  const clean = structuredClone(raw);

  if (source.format === 'items') {
    const validExpenses = validateList(source.expenses, 'expense', diagnostics);
    const validIncomes = validateList(source.incomes, 'income', diagnostics);
    clean.items = [
      ...validExpenses.map(item => ({ ...item, kind: 'expense', startDate: item.date, categoryId: item.category || '', active: true })),
      ...validIncomes.map(item => ({ ...item, kind: 'income', startDate: item.date, categoryId: item.category || '', active: true }))
    ];
    diagnostics.unshift('Imported unified v2 transaction data; stale legacy transaction arrays were ignored.');
  } else {
    clean.expenses = validateList(source.expenses, 'expense', diagnostics);
    clean.incomes = validateList(source.incomes, 'income', diagnostics);
  }

  return { data: migrate(clean), diagnostics };
}

function safeParseStored() {
  const text = localStorage.getItem(STORAGE_KEY);
  if (!text) return defaults();
  try { return migrate(JSON.parse(text)); }
  catch (error) {
    console.error('Finance Planner storage was corrupt. Attempting backup recovery.', error);
    const backup = localStorage.getItem(STORAGE_BACKUP_KEY);
    if (backup) {
      try { return migrate(JSON.parse(backup)); } catch { /* fall through */ }
    }
    return defaults();
  }
}

const listeners = new Set();

export const store = {
  data: safeParseStored(),
  revision: 0,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  notify() { listeners.forEach(fn => fn(this.data)); },
  save() {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) localStorage.setItem(STORAGE_BACKUP_KEY, current);
    this.data.version = APP_VERSION;
    this.data.balances = balancesFromAccounts(this.data.accounts);
    this.data.startingBalance = this.data.balances.checking + this.data.balances.savings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    this.revision += 1;
    this.notify();
  },
  import(raw) {
    const result = validateImport(structuredClone(raw));
    this.data = result.data;
    this.save();
    return result.diagnostics;
  }
};

function transactionCategoryIds() { return new Set(store.data.categories.map(category => category.id)); }

export const mutations = {
  add(type, raw) {
    const key = type === 'incomes' ? 'incomes' : 'expenses';
    store.data[key].push(normalizeItem(raw, key === 'incomes' ? 'income' : 'expense', transactionCategoryIds()));
    store.save();
  },
  update(originalType, id, nextType, raw) {
    const fromKey = originalType === 'incomes' ? 'incomes' : 'expenses';
    const toKey = nextType === 'incomes' ? 'incomes' : 'expenses';
    const index = store.data[fromKey].findIndex(item => item.id === id);
    if (index < 0) return false;
    const updated = normalizeItem({ ...raw, id }, toKey === 'incomes' ? 'income' : 'expense', transactionCategoryIds());
    store.data[fromKey].splice(index, 1);
    store.data[toKey].push(updated);
    store.save();
    return true;
  },
  remove(type, id) {
    const key = type === 'incomes' ? 'incomes' : 'expenses';
    store.data[key] = store.data[key].filter(item => item.id !== id);
    for (const overrideKey of Object.keys(store.data.occurrenceOverrides)) if (overrideKey.startsWith(`${id}@`)) delete store.data.occurrenceOverrides[overrideKey];
    store.data.funds.forEach(fund => { if (fund.linkedExpenseId === id) fund.linkedExpenseId = ''; });
    store.save();
  },
  setOccurrence(key, value) {
    if (!value || value.status === 'planned') delete store.data.occurrenceOverrides[key];
    else store.data.occurrenceOverrides[key] = { ...value, updatedAt: new Date().toISOString() };
    store.save();
  },
  addAccount(raw) { store.data.accounts.push(normalizeAccount(raw, store.data.accounts.length)); store.save(); },
  updateAccount(id, raw) {
    const index = store.data.accounts.findIndex(account => account.id === id);
    if (index < 0) return false;
    store.data.accounts[index] = normalizeAccount({ ...raw, id }, index);
    store.save(); return true;
  },
  removeAccount(id) {
    if (store.data.accounts.length <= 1) return false;
    store.data.accounts = store.data.accounts.filter(account => account.id !== id);
    [...store.data.expenses, ...store.data.incomes].forEach(item => { if (item.accountId === id) item.accountId = ''; });
    store.data.goals.forEach(goal => { if (goal.accountId === id) goal.accountId = ''; });
    store.data.funds.forEach(fund => { if (fund.accountId === id) fund.accountId = ''; });
    store.save(); return true;
  },
  addCategory(raw) {
    const id = String(raw.id || raw.name || uuid()).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `category-${uuid()}`;
    if (store.data.categories.some(category => category.id === id)) return false;
    store.data.categories.push({ id, name: String(raw.name || id).trim(), kind: raw.kind || 'expense' });
    store.save(); return true;
  },
  removeCategory(id) {
    if (['income', 'other'].includes(id)) return false;
    store.data.categories = store.data.categories.filter(category => category.id !== id);
    store.data.expenses.forEach(item => { if (item.category === id) item.category = 'other'; });
    store.data.incomes.forEach(item => { if (item.category === id) item.category = 'income'; });
    store.save(); return true;
  },
  addGoal(raw) { store.data.goals.push(normalizeGoal(raw)); store.save(); },
  updateGoal(id, raw) {
    const index = store.data.goals.findIndex(goal => goal.id === id);
    if (index < 0) return false;
    store.data.goals[index] = normalizeGoal({ ...raw, id }); store.save(); return true;
  },
  removeGoal(id) { store.data.goals = store.data.goals.filter(goal => goal.id !== id); store.save(); },
  addFund(raw) { store.data.funds.push(normalizeFund(raw)); store.save(); },
  updateFund(id, raw) {
    const index = store.data.funds.findIndex(fund => fund.id === id);
    if (index < 0) return false;
    store.data.funds[index] = normalizeFund({ ...raw, id }); store.save(); return true;
  },
  removeFund(id) { store.data.funds = store.data.funds.filter(fund => fund.id !== id); store.save(); },
  saveScenario(raw) { store.data.scenario = normalizeScenario(raw); store.save(); }
};
