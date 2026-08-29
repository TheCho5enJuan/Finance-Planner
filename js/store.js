import { APP_VERSION, STORAGE_KEY, STORAGE_BACKUP_KEY } from './constants.js';
import { parseAmount, parseISODate, sanitizeDescription, sanitizeFrequency, todayISO, uuid } from './utils.js';

export function defaults() {
  return {
    version: APP_VERSION,
    settings: {
      theme: 'dark',
      targetMode: 'range',
      targetRangeDays: 180,
      targetDate: ''
    },
    startingBalance: 0,
    balances: { checking: 0, savings: 0 },
    accounts: [{ id: 'acc-default', name: 'Checking', type: 'cash' }],
    categories: [],
    expenses: [],
    incomes: [],
    rules: [],
    goals: []
  };
}

function normalizeItem(raw = {}) {
  return {
    id: String(raw.id || uuid()),
    description: sanitizeDescription(raw.description),
    amount: parseAmount(raw.amount) ?? 0,
    date: parseISODate(raw.date) ? raw.date : todayISO(),
    endDate: raw.endDate && parseISODate(raw.endDate) ? raw.endDate : '',
    frequency: sanitizeFrequency(raw.frequency),
    category: typeof raw.category === 'string' ? raw.category.trim() : ''
  };
}

function normalizeList(list) {
  return Array.isArray(list) ? list.map(normalizeItem) : [];
}

function convertUnifiedItem(raw = {}) {
  return {
    id: raw.id,
    description: raw.description,
    amount: raw.amount,
    date: raw.startDate,
    endDate: raw.endDate || '',
    frequency: raw.frequency,
    category: typeof raw.categoryId === 'string' ? raw.categoryId : (raw.category || '')
  };
}

function transactionSource(raw) {
  // Some v2.0.33 exports contain both the newer unified `items` array and
  // stale legacy expenses/incomes arrays. The unified representation is the
  // source of truth when present so imports do not silently shift dates or
  // resurrect older amounts.
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

function normalizedBalances(raw) {
  if (raw?.balances && typeof raw.balances === 'object') {
    return {
      checking: Number(raw.balances.checking || 0),
      savings: Number(raw.balances.savings || 0)
    };
  }

  if (Array.isArray(raw?.accounts) && raw.accounts.some(account => Number.isFinite(Number(account?.balance)))) {
    let checking = 0;
    let savings = 0;
    for (const account of raw.accounts) {
      const amount = Number(account?.balance || 0);
      if (!Number.isFinite(amount)) continue;
      if (String(account?.type || '').toLowerCase() === 'savings') savings += amount;
      else checking += amount;
    }
    return { checking, savings };
  }

  return { checking: Number(raw?.startingBalance || 0), savings: 0 };
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults();

  const base = defaults();
  const source = transactionSource(raw);
  const balances = normalizedBalances(raw);
  const settings = { ...base.settings, ...(raw.settings || {}) };

  // Legacy v2 targetDate represented a fixed/custom date. New v3 range
  // selections are stored independently so they continue to roll forward.
  if (!raw.settings?.targetMode) {
    settings.targetMode = raw.settings?.targetDate ? 'date' : 'range';
    settings.targetRangeDays = 180;
  }

  // Build an explicit clean schema instead of spreading `raw`. This is
  // intentional: mixed-format backups can contain stale `items` arrays that
  // must not survive into v3 localStorage and override later edits on reload.
  return {
    version: APP_VERSION,
    settings,
    startingBalance: balances.checking + balances.savings,
    balances,
    accounts: Array.isArray(raw.accounts) ? structuredClone(raw.accounts) : base.accounts,
    categories: Array.isArray(raw.categories) ? structuredClone(raw.categories) : [],
    expenses: normalizeList(source.expenses),
    incomes: normalizeList(source.incomes),
    rules: Array.isArray(raw.rules) ? structuredClone(raw.rules) : [],
    goals: Array.isArray(raw.goals) ? structuredClone(raw.goals) : []
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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Backup must contain a JSON object.');
  }

  const diagnostics = [];
  const source = transactionSource(raw);
  const clean = structuredClone(raw);

  if (source.format === 'items') {
    const validExpenses = validateList(source.expenses, 'expense', diagnostics);
    const validIncomes = validateList(source.incomes, 'income', diagnostics);
    clean.items = [
      ...validExpenses.map(item => ({
        id: item.id,
        kind: 'expense',
        description: item.description,
        amount: item.amount,
        startDate: item.date,
        endDate: item.endDate,
        frequency: item.frequency,
        categoryId: item.category || '',
        active: true
      })),
      ...validIncomes.map(item => ({
        id: item.id,
        kind: 'income',
        description: item.description,
        amount: item.amount,
        startDate: item.date,
        endDate: item.endDate,
        frequency: item.frequency,
        categoryId: item.category || '',
        active: true
      }))
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
  try {
    return migrate(JSON.parse(text));
  } catch (error) {
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
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  notify() {
    listeners.forEach(fn => fn(this.data));
  },
  save() {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) localStorage.setItem(STORAGE_BACKUP_KEY, current);
    this.data.version = APP_VERSION;
    this.data.startingBalance = Number(this.data.balances?.checking || 0) + Number(this.data.balances?.savings || 0);
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

export const mutations = {
  add(type, raw) {
    const key = type === 'incomes' ? 'incomes' : 'expenses';
    store.data[key].push(normalizeItem(raw));
    store.save();
  },
  update(originalType, id, nextType, raw) {
    const fromKey = originalType === 'incomes' ? 'incomes' : 'expenses';
    const toKey = nextType === 'incomes' ? 'incomes' : 'expenses';
    const index = store.data[fromKey].findIndex(item => item.id === id);
    if (index < 0) return false;
    const updated = normalizeItem({ ...raw, id });
    store.data[fromKey].splice(index, 1);
    store.data[toKey].push(updated);
    store.save();
    return true;
  },
  remove(type, id) {
    const key = type === 'incomes' ? 'incomes' : 'expenses';
    const before = store.data[key].length;
    store.data[key] = store.data[key].filter(item => item.id !== id);
    if (before !== store.data[key].length) store.save();
  }
};
