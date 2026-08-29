import { occurrences } from './recurrence.js';
import { addDays, startOfDay } from './utils.js';

const DAY_MS = 86400000;

export function combinedBalance(data) {
  return Number(data?.balances?.checking || 0) + Number(data?.balances?.savings || 0);
}

export function itemsInRange(data, fromValue, toValue) {
  const from = startOfDay(fromValue);
  const to = startOfDay(toValue);
  const events = [];
  const collect = (item, sign, type) => {
    for (const date of occurrences(item, from, to)) {
      events.push({
        id: item.id,
        description: item.description,
        amount: Number(item.amount || 0) * sign,
        date,
        frequency: item.frequency,
        category: item.category || '',
        type
      });
    }
  };
  data.incomes.forEach(item => collect(item, 1, 'income'));
  data.expenses.forEach(item => collect(item, -1, 'expense'));
  events.sort((a, b) => a.date - b.date || a.description.localeCompare(b.description));
  return events;
}

export function simulateBalance(data, toValue, fromValue = new Date()) {
  const from = startOfDay(fromValue);
  const to = startOfDay(toValue);
  const events = itemsInRange(data, from, to);
  let balance = combinedBalance(data);
  let daysToNegative = null;
  const series = [{ x: new Date(from), y: balance }];

  for (const event of events) {
    balance += event.amount;
    series.push({ x: new Date(event.date), y: balance });
    if (balance < 0 && daysToNegative === null) {
      daysToNegative = Math.round((startOfDay(event.date) - from) / DAY_MS);
    }
  }

  if (series.length === 1 || series.at(-1).x < to) series.push({ x: new Date(to), y: balance });
  return { series, endBalance: balance, daysToNegative, events };
}

export function totals(data, fromValue, toValue) {
  let income = 0;
  let expense = 0;
  for (const event of itemsInRange(data, fromValue, toValue)) {
    if (event.amount >= 0) income += event.amount;
    else expense += Math.abs(event.amount);
  }
  return { income, expense, net: income - expense };
}

export function next12Months(data, fromValue = new Date()) {
  const from = startOfDay(fromValue);
  return totals(data, from, addDays(from, 365));
}

export function annualized(item) {
  const amount = Number(item.amount || 0);
  if (item.frequency === 'weekly') return amount * 52;
  if (item.frequency === 'biweekly') return amount * 26;
  if (item.frequency === 'monthly') return amount * 12;
  return amount;
}
