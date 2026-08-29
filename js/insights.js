import { LARGE_EXPENSE_THRESHOLD } from './constants.js';
import { categoryName, categoryTotals } from './categories.js';
import { actualVsPlanned, cashflowWindow, itemsInRange, next12Months, simulateBalance } from './forecast.js';
import { goalMetrics } from './planning.js';
import { addDays, startOfDay, toISODateLocal } from './utils.js';

export function buildInsights(data) {
  const today = startOfDay(new Date());
  const events180 = itemsInRange(data, today, addDays(today, 180));
  const events365 = itemsInRange(data, today, addDays(today, 365));
  const forecast = simulateBalance(data, addDays(today, 730), today);
  const twelve = next12Months(data, today);
  const thirty = cashflowWindow(data, 30, today);
  const actual = actualVsPlanned(data, today);
  const insights = [];

  const large = events180.find(event => event.type === 'expense' && Math.abs(event.amount) >= LARGE_EXPENSE_THRESHOLD);
  if (large) {
    insights.push({
      tone: 'warning',
      title: 'Large expense approaching',
      value: Math.abs(large.amount),
      detail: `${large.description} · ${toISODateLocal(large.date)}`,
      kind: 'currency'
    });
  }

  if (forecast.daysToNegative !== null) {
    insights.push({
      tone: 'danger',
      title: 'Negative cash balance projected',
      value: forecast.daysToNegative,
      detail: forecast.daysToNegative === 0 ? 'Projected today.' : `At the current plan, cash falls below zero in ${forecast.daysToNegative} days.`,
      kind: 'days'
    });
  } else {
    insights.push({ tone: 'success', title: 'Cash runway', value: forecast.endBalance, detail: 'No negative cash balance is projected in the next 24 months.', kind: 'currency' });
  }

  if (actual.unreconciled > 0) {
    insights.push({ tone: 'neutral', title: 'Reconciliation needed', value: actual.unreconciled, detail: `${actual.unreconciled} planned occurrence${actual.unreconciled === 1 ? '' : 's'} since tracking began have not been marked completed or skipped.`, kind: 'count' });
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
    insights.push({
      tone: metrics.progress >= 1 ? 'success' : 'neutral',
      title: goal.name,
      value: metrics.progress,
      detail: metrics.progress >= 1 ? 'Goal reached.' : `${Math.round(metrics.progress * 100)}% funded · remaining balance still needed.`,
      kind: 'percent'
    });
  }

  if (thirty.expense > thirty.income) {
    insights.push({ tone: 'warning', title: 'Next 30 days', value: thirty.expense - thirty.income, detail: `Scheduled expenses exceed scheduled income by this amount over the next 30 days.`, kind: 'currency' });
  } else {
    insights.push({ tone: 'success', title: 'Next 30 days', value: thirty.income - thirty.expense, detail: `Scheduled income exceeds scheduled expenses by this amount over the next 30 days.`, kind: 'currency' });
  }

  const savingsRate = twelve.income > 0 ? twelve.net / twelve.income : 0;
  insights.push({
    tone: savingsRate >= 0.15 ? 'success' : savingsRate >= 0 ? 'neutral' : 'danger',
    title: 'Projected savings rate',
    value: savingsRate,
    detail: 'Based on scheduled income and expenses over the next 12 months.',
    kind: 'percent'
  });

  return insights;
}
