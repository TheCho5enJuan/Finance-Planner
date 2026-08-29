import { LARGE_EXPENSE_THRESHOLD } from './constants.js';
import { combinedBalance, itemsInRange } from './forecast.js';
import { addDays, parseISODate, startOfDay, toISODateLocal } from './utils.js';

const DAY_MS = 86400000;

export function accountBalance(data, accountId) {
  return Number(data?.accounts?.find(account => account.id === accountId)?.balance || 0);
}

export function goalCurrentAmount(data, goal) {
  if (goal.source === 'cash') return combinedBalance(data);
  if (goal.source === 'account') return accountBalance(data, goal.accountId);
  return Number(goal.currentAmount || 0);
}

export function goalMetrics(data, goal) {
  const current = goalCurrentAmount(data, goal);
  const target = Math.max(0, Number(goal.targetAmount || 0));
  const remaining = Math.max(0, target - current);
  const progress = target > 0 ? Math.min(1, current / target) : 0;
  let monthlyRequired = null;
  if (goal.targetDate) {
    const today = startOfDay(new Date());
    const targetDate = parseISODate(goal.targetDate);
    if (targetDate && targetDate > today) {
      const months = Math.max(1, Math.ceil((targetDate - today) / DAY_MS / 30.4375));
      monthlyRequired = remaining / months;
    }
  }
  return { current, target, remaining, progress, monthlyRequired };
}

export function fundMetrics(fund, fromValue = new Date()) {
  const target = Math.max(0, Number(fund.targetAmount || 0));
  const reserved = Math.max(0, Number(fund.reservedAmount || 0));
  const remaining = Math.max(0, target - reserved);
  const due = parseISODate(fund.dueDate);
  const from = startOfDay(fromValue);
  const days = due && due >= from ? Math.max(1, Math.ceil((due - from) / DAY_MS)) : null;
  const weeks = days ? Math.max(1, days / 7) : null;
  const months = days ? Math.max(1, days / 30.4375) : null;
  return {
    target,
    reserved,
    remaining,
    progress: target > 0 ? Math.min(1, reserved / target) : 0,
    days,
    weeklyRequired: weeks ? remaining / weeks : null,
    monthlyRequired: months ? remaining / months : null
  };
}

export function suggestedFunds(data, horizonDays = 730) {
  const from = startOfDay(new Date());
  const to = addDays(from, horizonDays);
  const linked = new Set((data.funds || []).map(fund => fund.linkedExpenseId).filter(Boolean));
  const seen = new Set();
  const suggestions = [];

  for (const event of itemsInRange(data, from, to, { includeOverrides: false })) {
    if (event.type !== 'expense' || Math.abs(event.plannedAmount ?? event.amount) < LARGE_EXPENSE_THRESHOLD) continue;
    const item = data.expenses.find(expense => expense.id === event.id);
    if (!item || linked.has(item.id) || seen.has(item.id)) continue;
    if (!['once', 'yearly'].includes(item.frequency)) continue;
    seen.add(item.id);
    suggestions.push({
      expenseId: item.id,
      name: item.description,
      targetAmount: Number(item.amount || 0),
      dueDate: toISODateLocal(event.date),
      category: item.category || 'other'
    });
  }
  return suggestions.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8);
}

export function planTotals(data) {
  const goalsRemaining = (data.goals || []).reduce((sum, goal) => sum + goalMetrics(data, goal).remaining, 0);
  const fundsRemaining = (data.funds || []).reduce((sum, fund) => sum + fundMetrics(fund).remaining, 0);
  return { goalsRemaining, fundsRemaining, totalRemaining: goalsRemaining + fundsRemaining };
}
