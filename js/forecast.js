import { occurrences } from './recurrence.js';
import { addDays, parseISODate, startOfDay, toISODateLocal } from './utils.js';

const DAY_MS = 86400000;

export function combinedBalance(data) {
  if (Array.isArray(data?.accounts) && data.accounts.length) {
    return data.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  }
  return Number(data?.balances?.checking || 0) + Number(data?.balances?.savings || 0);
}

export function occurrenceKey(itemId, date) {
  return `${itemId}@${toISODateLocal(date)}`;
}

function applyOverride(data, event) {
  const key = occurrenceKey(event.id, event.date);
  const override = data?.occurrenceOverrides?.[key];
  const plannedAmount = Number(event.amount || 0);
  if (!override || override.status === 'planned') return { ...event, key, plannedAmount, status: 'planned' };
  if (override.status === 'skipped') return { ...event, key, plannedAmount, amount: 0, status: 'skipped', override };
  const magnitude = override.actualAmount === null || typeof override.actualAmount === 'undefined'
    ? Math.abs(plannedAmount)
    : Math.abs(Number(override.actualAmount || 0));
  const amount = event.type === 'expense' ? -magnitude : magnitude;
  const actualDate = override.actualDate ? parseISODate(override.actualDate) : null;
  return { ...event, key, plannedAmount, amount, date: actualDate || event.date, status: 'completed', accountId: override.accountId || event.accountId || '', override };
}

function scenarioEvents(data, from, to) {
  const scenario = data?.scenario;
  if (!scenario?.enabled) return [];
  const start = startOfDay(new Date());
  const out = [];
  const pushMonthly = (description, amount, type) => {
    if (!amount) return;
    const item = { id: `scenario-${type}`, description, amount: Math.abs(amount), date: toISODateLocal(start), endDate: '', frequency: 'monthly' };
    for (const date of occurrences(item, from, to)) {
      out.push({ id: item.id, description, amount: type === 'expense' ? -Math.abs(amount) : Math.abs(amount), date, frequency: 'monthly', category: type === 'expense' ? 'other' : 'income', type, scenario: true, status: 'scenario', plannedAmount: type === 'expense' ? -Math.abs(amount) : Math.abs(amount) });
    }
  };
  pushMonthly('Scenario monthly income', Number(scenario.monthlyIncomeDelta || 0), 'income');
  pushMonthly('Scenario monthly expense', Number(scenario.monthlyExpenseDelta || 0), 'expense');
  if (scenario.oneTimeDelta && scenario.oneTimeDate) {
    const date = parseISODate(scenario.oneTimeDate);
    if (date && date >= from && date <= to) {
      out.push({ id: 'scenario-one-time', description: scenario.name || 'Scenario adjustment', amount: Number(scenario.oneTimeDelta || 0), plannedAmount: Number(scenario.oneTimeDelta || 0), date, frequency: 'once', category: Number(scenario.oneTimeDelta) >= 0 ? 'income' : 'other', type: Number(scenario.oneTimeDelta) >= 0 ? 'income' : 'expense', scenario: true, status: 'scenario' });
    }
  }
  return out;
}

export function itemsInRange(data, fromValue, toValue, options = {}) {
  const from = startOfDay(fromValue);
  const to = startOfDay(toValue);
  // v4.1 is intentionally plan-first. Historical occurrence overrides remain
  // import-compatible, but they only affect calculations when explicitly asked for.
  const includeOverrides = options.includeOverrides === true;
  const events = [];
  const collect = (item, sign, type) => {
    if (item.active === false) return;
    for (const date of occurrences(item, from, to)) {
      const base = { id: item.id, description: item.description, amount: Number(item.amount || 0) * sign, date, frequency: item.frequency, category: item.category || (type === 'income' ? 'income' : 'other'), accountId: item.accountId || '', type };
      events.push(includeOverrides ? applyOverride(data, base) : { ...base, key: occurrenceKey(item.id, date), plannedAmount: base.amount, status: 'planned' });
    }
  };
  (data.incomes || []).forEach(item => collect(item, 1, 'income'));
  (data.expenses || []).forEach(item => collect(item, -1, 'expense'));
  if (options.includeScenario) events.push(...scenarioEvents(data, from, to));
  events.sort((a, b) => a.date - b.date || a.description.localeCompare(b.description));
  return events;
}

export function simulateBalance(data, toValue, fromValue = new Date(), options = {}) {
  const from = startOfDay(fromValue);
  const to = startOfDay(toValue);
  const events = itemsInRange(data, from, to, options);
  let balance = combinedBalance(data);
  let daysToNegative = null;
  const series = [{ x: new Date(from), y: balance }];
  for (const event of events) {
    balance += event.amount;
    series.push({ x: new Date(event.date), y: balance });
    if (balance < 0 && daysToNegative === null) daysToNegative = Math.round((startOfDay(event.date) - from) / DAY_MS);
  }
  if (series.length === 1 || series.at(-1).x < to) series.push({ x: new Date(to), y: balance });
  return { series, endBalance: balance, daysToNegative, events };
}

export function totals(data, fromValue, toValue, options = {}) {
  let income = 0;
  let expense = 0;
  for (const event of itemsInRange(data, fromValue, toValue, options)) {
    if (event.amount >= 0) income += event.amount;
    else expense += Math.abs(event.amount);
  }
  return { income, expense, net: income - expense };
}

export function next12Months(data, fromValue = new Date(), options = {}) {
  const from = startOfDay(fromValue);
  return totals(data, from, addDays(from, 365), options);
}

export function cashflowWindow(data, days = 30, fromValue = new Date(), options = {}) {
  const from = startOfDay(fromValue);
  return totals(data, from, addDays(from, days), options);
}

export function actualVsPlanned(data, throughValue = new Date()) {
  const start = parseISODate(data?.settings?.trackingStartDate) || startOfDay(throughValue);
  const through = startOfDay(throughValue);
  const startingBalance = Number(data?.settings?.trackingStartBalance ?? combinedBalance(data));
  const plannedEvents = itemsInRange(data, start, through, { includeOverrides: false });
  const expectedBalance = plannedEvents.reduce((balance, event) => balance + event.amount, startingBalance);
  const actualBalance = combinedBalance(data);
  const variance = actualBalance - expectedBalance;
  const reconciledKeys = new Set(Object.entries(data?.occurrenceOverrides || {}).filter(([, value]) => ['completed', 'skipped'].includes(value?.status)).map(([key]) => key));
  const unreconciled = plannedEvents.filter(event => !reconciledKeys.has(event.key)).length;
  return { start, through, startingBalance, expectedBalance, actualBalance, variance, unreconciled, plannedCount: plannedEvents.length };
}

export function annualized(item) {
  const amount = Number(item.amount || 0);
  if (item.frequency === 'weekly') return amount * 52;
  if (item.frequency === 'biweekly') return amount * 26;
  if (item.frequency === 'monthly') return amount * 12;
  return amount;
}
