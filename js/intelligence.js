import { annualized, combinedBalance, next12Months, simulateBalance, totals } from './forecast.js';
import { addDays, parseISODate, startOfDay, toISODateLocal, uuid } from './utils.js';

const DAY_MS = 86400000;
const AVG_MONTH_DAYS = 30.4375;
const DEFAULT_EMERGENCY_MONTHS = 3;
const DEFAULT_MAJOR_EXPENSE = 1000;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function normalizedHistory(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(row => row && parseISODate(row.date) && Number.isFinite(Number(row.total)))
    .map(row => ({
      id: String(row.id || uuid()),
      date: row.date,
      timestamp: row.timestamp || `${row.date}T12:00:00`,
      sourceTimestamp: row.sourceTimestamp || row.timestamp || '',
      total: finite(row.total),
      expectedTotal: row.expectedTotal == null ? null : finite(row.expectedTotal),
      variance: row.variance == null ? null : finite(row.variance),
      accuracy: row.accuracy == null ? null : Math.max(0, Math.min(1, finite(row.accuracy))),
      accounts: Array.isArray(row.accounts) ? row.accounts.map(account => ({
        id: String(account.id || ''),
        name: String(account.name || 'Account'),
        balance: finite(account.balance)
      })) : []
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.timestamp).localeCompare(String(b.timestamp)))
    .slice(-500);
}

export function ensureIntelligenceState(data) {
  data.settings ||= {};
  const current = data.settings.intelligence && typeof data.settings.intelligence === 'object'
    ? data.settings.intelligence
    : {};
  const emergencyMonths = finite(current.emergencyMonths, DEFAULT_EMERGENCY_MONTHS);
  data.settings.intelligence = {
    schemaVersion: 1,
    adaptiveForecast: current.adaptiveForecast !== false,
    emergencyMonths: Math.max(0, Math.min(24, emergencyMonths || DEFAULT_EMERGENCY_MONTHS)),
    majorExpenseThreshold: Math.max(100, finite(current.majorExpenseThreshold, DEFAULT_MAJOR_EXPENSE)),
    history: normalizedHistory(current.history)
  };
  return data.settings.intelligence;
}

export function balanceHistory(data) {
  return normalizedHistory(data?.settings?.intelligence?.history || []);
}

export function plannedNetBetween(data, fromDate, toDate) {
  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);
  if (from > to) return 0;
  return totals(data, from, to, { includeOverrides: false }).net;
}

export function recordBalanceSnapshot(data, timestamp = new Date().toISOString()) {
  const state = ensureIntelligenceState(data);
  const parsedTimestamp = new Date(timestamp);
  const safeTimestamp = Number.isNaN(parsedTimestamp.getTime()) ? new Date() : parsedTimestamp;
  const date = toISODateLocal(safeTimestamp);
  const total = combinedBalance(data);

  const history = balanceHistory(data).filter(row => row.date !== date);
  const previous = history.at(-1) || null;
  let expectedTotal = null;
  let variance = null;
  let accuracy = null;

  if (previous) {
    const previousDate = parseISODate(previous.date);
    const currentDate = parseISODate(date);
    const from = addDays(previousDate, 1);
    const expectedNet = from <= currentDate ? plannedNetBetween(data, from, currentDate) : 0;
    expectedTotal = previous.total + expectedNet;
    variance = total - expectedTotal;
    accuracy = 1 - Math.min(1, Math.abs(variance) / Math.max(Math.abs(expectedTotal), 1));
  }

  const snapshot = {
    id: `balance-${uuid()}`,
    date,
    timestamp: safeTimestamp.toISOString(),
    sourceTimestamp: timestamp,
    total,
    expectedTotal,
    variance,
    accuracy,
    accounts: (data.accounts || []).map(account => ({ id: account.id, name: account.name, balance: finite(account.balance) }))
  };

  history.push(snapshot);
  state.history = history.sort((a, b) => a.date.localeCompare(b.date)).slice(-500);
  return snapshot;
}

export function ensureInitialSnapshot(data) {
  const state = ensureIntelligenceState(data);
  if (state.history.length) return null;
  const timestamp = data?.settings?.lastBalanceUpdate || new Date().toISOString();
  return recordBalanceSnapshot(data, timestamp);
}

function historyIntervals(data) {
  const history = balanceHistory(data);
  const intervals = [];
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1];
    const current = history[index];
    const previousDate = parseISODate(previous.date);
    const currentDate = parseISODate(current.date);
    const days = Math.max(1, Math.round((currentDate - previousDate) / DAY_MS));
    const from = addDays(previousDate, 1);
    const expectedNet = from <= currentDate ? plannedNetBetween(data, from, currentDate) : 0;
    // Snapshot-time values are authoritative. This prevents later edits to the
    // plan from rewriting what Finance Planner learned from a past check-in.
    const expectedTotal = current.expectedTotal == null ? previous.total + expectedNet : current.expectedTotal;
    const error = current.variance == null ? current.total - expectedTotal : current.variance;
    const monthlyError = error * AVG_MONTH_DAYS / days;
    const accuracy = current.accuracy == null
      ? 1 - Math.min(1, Math.abs(error) / Math.max(Math.abs(expectedTotal), 1))
      : current.accuracy;
    intervals.push({ previous, current, days, expectedNet, expectedTotal, error, monthlyError, accuracy });
  }
  return intervals;
}

export function forecastLearning(data) {
  const history = balanceHistory(data);
  const intervals = historyIntervals(data);
  const monthlyErrors = intervals.map(row => row.monthlyError);
  const center = median(monthlyErrors);
  const monthlyUnmodeledSpend = Math.max(0, -center);
  const monthlyUncertainty = median(monthlyErrors.map(value => Math.abs(value - center))) || median(monthlyErrors.map(Math.abs));
  const accuracy = intervals.length ? intervals.reduce((sum, row) => sum + row.accuracy, 0) / intervals.length : null;
  const confidence = Math.min(1, intervals.length / 5);
  return {
    historyCount: history.length,
    intervalCount: intervals.length,
    monthlyError: center,
    monthlyUnmodeledSpend,
    monthlyUncertainty,
    accuracy,
    confidence,
    status: intervals.length === 0 ? 'learning' : intervals.length < 3 ? 'early' : 'established'
  };
}

export function balanceTrend(data) {
  const history = balanceHistory(data);
  if (!history.length) return { history, change: 0, days: 0, monthlyPace: 0, annualPace: 0 };
  const first = history[0];
  const last = history.at(-1);
  const days = Math.max(0, Math.round((parseISODate(last.date) - parseISODate(first.date)) / DAY_MS));
  const change = last.total - first.total;
  const monthlyPace = days > 0 ? change * AVG_MONTH_DAYS / days : 0;
  return { history, first, last, change, days, monthlyPace, annualPace: monthlyPace * 12 };
}

function monthsFrom(start, date) {
  return Math.max(0, (startOfDay(date) - startOfDay(start)) / DAY_MS / AVG_MONTH_DAYS);
}

export function adaptiveForecast(data, toValue, fromValue = new Date()) {
  const from = startOfDay(fromValue);
  const plan = simulateBalance(data, toValue, from, { includeOverrides: false, includeScenario: false });
  const learning = forecastLearning(data);
  const settings = ensureIntelligenceState(data);
  const useAdaptive = settings.adaptiveForecast && learning.intervalCount > 0;
  const buffer = useAdaptive ? learning.monthlyUnmodeledSpend : 0;
  const uncertainty = useAdaptive ? learning.monthlyUncertainty : 0;

  const series = plan.series.map(point => {
    const months = monthsFrom(from, point.x);
    return { x: new Date(point.x), y: point.y - buffer * months };
  });
  const upperSeries = series.map(point => {
    const months = monthsFrom(from, point.x);
    const band = uncertainty * Math.sqrt(Math.max(0, months));
    return { x: new Date(point.x), y: point.y + band };
  });
  const lowerSeries = series.map(point => {
    const months = monthsFrom(from, point.x);
    const band = uncertainty * Math.sqrt(Math.max(0, months));
    return { x: new Date(point.x), y: point.y - band };
  });

  return {
    plan,
    series,
    upperSeries,
    lowerSeries,
    learning,
    adaptive: useAdaptive,
    endBalance: series.at(-1)?.y ?? plan.endBalance,
    lowerEnd: lowerSeries.at(-1)?.y ?? plan.endBalance,
    upperEnd: upperSeries.at(-1)?.y ?? plan.endBalance
  };
}

export function futureObligations(data, horizonDays = 365) {
  const settings = ensureIntelligenceState(data);
  const threshold = settings.majorExpenseThreshold;
  const from = startOfDay(new Date());
  const to = addDays(from, horizonDays);
  const expenseById = new Map((data.expenses || []).map(item => [item.id, item]));
  const obligations = [];
  for (const event of simulateBalance(data, to, from, { includeOverrides: false }).events) {
    if (event.type !== 'expense' || Math.abs(event.amount) < threshold) continue;
    const source = expenseById.get(event.id);
    if (!source || !['once', 'yearly'].includes(source.frequency)) continue;
    obligations.push({
      id: `${event.id}@${toISODateLocal(event.date)}`,
      expenseId: event.id,
      description: event.description,
      date: toISODateLocal(event.date),
      amount: Math.abs(event.amount),
      category: event.category,
      frequency: source.frequency
    });
  }
  obligations.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  return obligations;
}

export function recurringMonthlyExpenses(data) {
  return (data.expenses || [])
    .filter(item => item.active !== false && item.frequency !== 'once')
    .reduce((sum, item) => sum + annualized(item), 0) / 12;
}

export function recurringMonthlyIncome(data) {
  return (data.incomes || [])
    .filter(item => item.active !== false && item.frequency !== 'once')
    .reduce((sum, item) => sum + annualized(item), 0) / 12;
}

export function safeToSpend(data, horizonDays = 365) {
  const cash = combinedBalance(data);
  const settings = ensureIntelligenceState(data);
  const obligations = futureObligations(data, horizonDays);
  const obligationReserve = obligations.reduce((sum, item) => sum + item.amount, 0);
  const monthlyRecurring = recurringMonthlyExpenses(data);
  const emergencyReserve = monthlyRecurring * settings.emergencyMonths;
  const raw = cash - obligationReserve - emergencyReserve;
  return {
    cash,
    obligations,
    obligationReserve,
    monthlyRecurring,
    emergencyMonths: settings.emergencyMonths,
    emergencyReserve,
    safeToSpend: Math.max(0, raw),
    reserveShortfall: Math.max(0, -raw)
  };
}

export function purchaseImpact(data, amountValue, dateValue = new Date()) {
  const amount = Math.max(0, finite(amountValue));
  const requestedDate = parseISODate(dateValue) || startOfDay(dateValue) || startOfDay(new Date());
  const from = startOfDay(new Date());
  const horizon = addDays(from, 365);
  const purchaseDate = requestedDate < from ? from : requestedDate;
  const forecast = adaptiveForecast(data, horizon, from);
  const adjusted = forecast.series.map(point => ({
    x: new Date(point.x),
    y: point.x >= purchaseDate ? point.y - amount : point.y
  }));

  // Add an exact purchase-date point so the reported minimum cannot miss a
  // temporary cash dip between scheduled cash-flow events.
  if (purchaseDate <= horizon) {
    const atPurchase = adaptiveForecast(data, purchaseDate, from);
    const exactPoint = { x: new Date(purchaseDate), y: atPurchase.endBalance - amount };
    const sameTimestamp = adjusted.findIndex(point => point.x.getTime() === purchaseDate.getTime());
    if (sameTimestamp >= 0) adjusted[sameTimestamp] = exactPoint;
    else adjusted.push(exactPoint);
    adjusted.sort((a, b) => a.x - b.x);
  }

  const endBalance = adjusted.at(-1)?.y ?? combinedBalance(data) - amount;
  const minBalance = adjusted.reduce((minimum, point) => Math.min(minimum, point.y), Number.POSITIVE_INFINITY);
  const safe = safeToSpend(data);
  const safeAfter = safe.safeToSpend - amount;
  let risk = 'low';
  if (minBalance < 0 || safeAfter < 0) risk = 'high';
  else if (minBalance < safe.emergencyReserve || amount > safe.safeToSpend * 0.6) risk = 'moderate';
  return {
    amount,
    date: toISODateLocal(purchaseDate),
    baselineEnd: forecast.endBalance,
    endBalance,
    minBalance,
    safeBefore: safe.safeToSpend,
    safeAfter: Math.max(0, safeAfter),
    risk,
    series: adjusted
  };
}

function accountMonthlyPace(data, accountId) {
  const history = balanceHistory(data).filter(row => row.accounts.some(account => account.id === accountId));
  if (history.length < 2) return 0;
  const first = history[0], last = history.at(-1);
  const firstBalance = first.accounts.find(account => account.id === accountId)?.balance;
  const lastBalance = last.accounts.find(account => account.id === accountId)?.balance;
  if (!Number.isFinite(firstBalance) || !Number.isFinite(lastBalance)) return 0;
  const days = Math.max(1, Math.round((parseISODate(last.date) - parseISODate(first.date)) / DAY_MS));
  return (lastBalance - firstBalance) * AVG_MONTH_DAYS / days;
}

export function goalOutlook(data, goal) {
  const target = Math.max(0, finite(goal.targetAmount));
  let current = finite(goal.currentAmount);
  let pace = 0;
  if (goal.source === 'cash') {
    current = combinedBalance(data);
    pace = balanceTrend(data).monthlyPace;
  } else if (goal.source === 'account') {
    current = finite(data.accounts?.find(account => account.id === goal.accountId)?.balance);
    pace = accountMonthlyPace(data, goal.accountId);
  }
  const remaining = Math.max(0, target - current);
  const months = remaining === 0 ? 0 : pace > 0 ? remaining / pace : null;
  const projectedDate = months == null ? '' : toISODateLocal(addDays(new Date(), Math.ceil(months * AVG_MONTH_DAYS)));
  return { current, target, remaining, pace, months, projectedDate };
}

export function recurringOptimizations(data, horizonDays = 1826) {
  const from = startOfDay(new Date());
  const to = addDays(from, horizonDays);
  const baseline = simulateBalance(data, to, from, { includeOverrides: false }).endBalance;
  return (data.expenses || [])
    .filter(item => item.active !== false && item.frequency !== 'once' && Number(item.amount) > 0)
    .map(item => {
      const clone = { ...data, expenses: data.expenses.filter(expense => expense.id !== item.id) };
      const without = simulateBalance(clone, to, from, { includeOverrides: false }).endBalance;
      return {
        id: item.id,
        description: item.description,
        frequency: item.frequency,
        amount: finite(item.amount),
        annualCost: annualized(item),
        horizonBenefit: without - baseline
      };
    })
    .sort((a, b) => b.horizonBenefit - a.horizonBenefit);
}

export function financialHealth(data) {
  const cash = combinedBalance(data);
  const monthlyExpense = recurringMonthlyExpenses(data);
  const monthlyIncome = recurringMonthlyIncome(data);
  const coverageMonths = monthlyExpense > 0 ? cash / monthlyExpense : Number.POSITIVE_INFINITY;
  const fixedRatio = monthlyIncome > 0 ? monthlyExpense / monthlyIncome : 0;
  const safe = safeToSpend(data);
  const twelve = next12Months(data, new Date(), { includeOverrides: false });
  const adaptive = adaptiveForecast(data, addDays(new Date(), 365), new Date());

  const cashStatus = coverageMonths >= 6 ? 'strong' : coverageMonths >= 3 ? 'good' : coverageMonths >= 1 ? 'watch' : 'risk';
  const flowStatus = twelve.net > 0 ? 'strong' : twelve.net === 0 ? 'watch' : 'risk';
  const ratioStatus = fixedRatio <= 0.5 ? 'strong' : fixedRatio <= 0.7 ? 'good' : fixedRatio <= 0.9 ? 'watch' : 'risk';
  const obligationsStatus = safe.reserveShortfall > 0 ? 'risk' : safe.safeToSpend > safe.cash * 0.15 ? 'strong' : 'watch';
  const forecastStatus = adaptive.lowerEnd < 0 ? 'risk' : adaptive.endBalance < cash ? 'watch' : 'strong';

  return [
    { key: 'cash', label: 'Cash position', status: cashStatus, value: Number.isFinite(coverageMonths) ? `${coverageMonths.toFixed(1)} months` : 'No recurring costs', detail: 'Current cash divided by recurring monthly expenses.' },
    { key: 'flow', label: '12-month cash flow', status: flowStatus, value: twelve.net, kind: 'currency', detail: 'Scheduled income minus scheduled expenses over the next year.' },
    { key: 'reserve', label: 'Emergency reserve', status: coverageMonths >= ensureIntelligenceState(data).emergencyMonths ? 'strong' : 'watch', value: safe.emergencyReserve, kind: 'currency', detail: `${ensureIntelligenceState(data).emergencyMonths} months of recurring expenses.` },
    { key: 'ratio', label: 'Fixed cost ratio', status: ratioStatus, value: fixedRatio, kind: 'percent', detail: 'Annualized recurring expenses divided by recurring income.' },
    { key: 'obligations', label: 'Major obligations', status: obligationsStatus, value: safe.obligationReserve, kind: 'currency', detail: `${safe.obligations.length} major one-time or annual obligation${safe.obligations.length === 1 ? '' : 's'} inside 12 months.` },
    { key: 'forecast', label: 'Forecast risk', status: forecastStatus, value: adaptive.lowerEnd, kind: 'currency', detail: adaptive.adaptive ? 'Conservative 12-month confidence estimate based on your balance history.' : 'Learning from future balance check-ins.' }
  ];
}
