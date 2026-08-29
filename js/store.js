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

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return defaults();
  const data = { ...defaults(), ...raw };
  data.settings = { ...defaults().settings, ...(raw.settings || {}) };

  if (!raw.balances) {
    data.balances = { checking: Number(raw.startingBalance || 0), savings: 0 };
  } else {
    data.balances = {
      checking: Number(raw.balances.checking || 0),
      savings: Number(raw.balances.savings || 0)
    };
  }

  // Legacy v2 targetDate represented either a selected range or a custom date.
  if (!raw.settings?.targetMode) {
    data.settings.targetMode = raw.settings?.targetDate ? 'date' : 'range';
    data.settings.targetRangeDays = 180;
  }

  data.expenses = normalizeList(raw.expenses);
  data.incomes = normalizeList(raw.incomes);
  data.startingBalance = data.balances.checking + data.balances.savings;
  data.version = APP_VERSION;
  return data;
}

export function validateImport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Backup must contain a JSON object.');
  }

  const diagnostics = [];
  for (const [key, label] of [['expenses', 'expense'], ['incomes', 'income']]) {
    if (!Array.isArray(raw[key])) continue;
    raw[key] = raw[key].filter((item, index) => {
      const validAmount = parseAmount(item?.amount) !== null;
      const validDate = Boolean(parseISODate(item?.date));
      if (!validAmount || !validDate) {
        diagnostics.push(`${label} ${index + 1} skipped: invalid ${!validAmount ? 'amount' : 'date'}.`);
        return false;
      }
      if (item?.endDate && !parseISODate(item.endDate)) {
        diagnostics.push(`${label} ${index + 1}: invalid end date removed.`);
        item = { ...item, endDate: '' };
      }
      return true;
    });
  }
  return { data: migrate(raw), diagnostics };
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
