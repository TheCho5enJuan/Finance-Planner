import { LARGE_EXPENSE_THRESHOLD } from './constants.js';
import { categoryName, categoryTotals } from './categories.js';
import { cashflowWindow, itemsInRange, next12Months, simulateBalance } from './forecast.js';
import { goalMetrics } from './planning.js';
import { addDays, startOfDay, toISODateLocal } from './utils.js';

export function buildInsights(data) {
  const today = startOfDay(new Date());
  const events180 = itemsInRange(data, today, addDays(today, 180), { includeOverrides: false });
  const events365 = itemsInRange(data, today, addDays(today, 365), { includeOverrides: false });
  const forecast = simulateBalance(data, addDays(today, 730), today, { includeOverrides: false });
  const twelve = next12Months(data, today, { includeOverrides: false });
  const thirty = cashflowWindow(data, 30, today, { includeOverrides: false });
  const insights = [];

  const lastUpdate = data?.settings?.lastBalanceUpdate ? new Date(data.settings.lastBalanceUpdate) : null;
  const daysSinceUpdate = lastUpdate && !Number.isNaN(lastUpdate.getTime()) ? Math.floor((Date.now() - lastUpdate.getTime()) / 86400000) : null;
  if (daysSinceUpdate === null) {
    insights.push({ tone: 'neutral', title: 'Balance check-in', value: 'Update', detail: 'Enter your current account balances to anchor the forecast to reality.', kind: 'text' });
  } else if (daysSinceUpdate > 14) {
    insights.push({ tone: 'warning', title: 'Balances may be stale', value: daysSinceUpdate, detail: 'Your forecast will be more useful after a quick account-balance update.', kind: 'days' });
  } else {
    insights.push({ tone: 'success', title: 'Balance check-in', value: daysSinceUpdate, detail: daysSinceUpdate === 0 ? 'Account balances were updated today.' : `Account balances were updated ${daysSinceUpdate} days ago.`, kind: 'days' });
  }

  const large = events180.find(event => event.type === 'expense' && Math.abs(event.amount) >= LARGE_EXPENSE_THRESHOLD);
  if (large) insights.push({ tone: 'warning', title: 'Large expense approaching', value: Math.abs(large.amount), detail: `${large.description} · ${toISODateLocal(large.date)}`, kind: 'currency' });

  if (forecast.daysToNegative !== null) {
    insights.push({ tone: 'danger', title: 'Negative cash balance projected', value: forecast.daysToNegative, detail: forecast.daysToNegative === 0 ? 'Projected today.' : `At the current plan, cash falls below zero in ${forecast.daysToNegative} days.`, kind: 'days' });
  } else {
    insights.push({ tone: 'success', title: 'Cash runway', value: forecast.endBalance, detail: 'No negative cash balance is projected in the next 24 months.', kind: 'currency' });
  }

  const categories = categoryTotals(events365);
  if (categories.length) {
    const top = categories[0];
    insights.push({ tone: 'neutral', title: 'Largest spending category', value: top.amount, detail: `${categoryName(data, top.id)} is your largest projected expense category over the next 12 months.`, kind: 'currency' });
  }

  const ending = (data.expenses || [])
    .filter(item => item.endDate && item.endDate >= toISODateLocal(today) && item.endDate <= toISODateLocal(addDays(today, 180)))
    .sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
  if (ending) insights.push({ tone: 'success', title: 'Payment ending soon', value: Number(ending.amount || 0), detail: `${ending.description} ends ${ending.endDate}.`, kind: 'currency' });

  for (const goal of (data.goals || []).slice(0, 2)) {
    const metrics = goalMetrics(data, goal);
    insights.push({ tone: metrics.progress >= 1 ? 'success' : 'neutral', title: goal.name, value: metrics.progress, detail: metrics.progress >= 1 ? 'Goal reached.' : `${Math.round(metrics.progress * 100)}% funded · remaining balance still needed.`, kind: 'percent' });
  }

  if (thirty.expense > thirty.income) insights.push({ tone: 'warning', title: 'Next 30 days', value: thirty.expense - thirty.income, detail: 'Scheduled expenses exceed scheduled income by this amount over the next 30 days.', kind: 'currency' });
  else insights.push({ tone: 'success', title: 'Next 30 days', value: thirty.income - thirty.expense, detail: 'Scheduled income exceeds scheduled expenses by this amount over the next 30 days.', kind: 'currency' });

  const savingsRate = twelve.income > 0 ? twelve.net / twelve.income : 0;
  insights.push({ tone: savingsRate >= 0.15 ? 'success' : savingsRate >= 0 ? 'neutral' : 'danger', title: 'Projected savings rate', value: savingsRate, detail: 'Based on scheduled income and expenses over the next 12 months.', kind: 'percent' });

  return insights;
}
