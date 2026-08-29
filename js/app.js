import { APP_VERSION, RANGE_OPTIONS } from './constants.js';
import { store, mutations } from './store.js';
import { annualized, cashflowWindow, combinedBalance, itemsInRange, next12Months, simulateBalance } from './forecast.js';
import { drawBalanceChart } from './charts.js';
import { DEFAULT_CATEGORIES, categoryName, categoryTotals, suggestCategory } from './categories.js';
import { buildInsights } from './insights.js';
import { fundMetrics, goalMetrics, suggestedFunds } from './planning.js';
import { $, $$, addDays, debounce, downloadText, money, parseAmount, parseISODate, startOfDay, todayISO, toISODateLocal, uuid } from './utils.js';

let activeView = 'overview';
let editingId = null;
let editingType = 'expenses';
let editingGoalId = null;
let editingFundId = null;
let editingAccountId = null;
let currentSeries = [];
let scenarioSeries = [];
let currentEvents = [];
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = todayISO();

const defaultCategoryIds = new Set(DEFAULT_CATEGORIES.map(category => category.id));

function node(selector) { return $(selector); }
function nodes(selector) { return $$(selector); }
function on(selector, eventName, handler) {
  const el = node(selector);
  if (!el) {
    console.warn(`Finance Planner: optional control ${selector} was not found.`);
    return false;
  }
  el.addEventListener(eventName, handler);
  return true;
}
function setText(selector, text) { const el = node(selector); if (el) el.textContent = text; }
function setValue(selector, value) { const el = node(selector); if (el) el.value = value ?? ''; }
function clear(el) { if (el) el.replaceChildren(); }
function statusClass(value) { return value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'; }
function setTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
}
function targetDate() {
  const settings = store.data.settings || {};
  if (settings.targetMode === 'date' && parseISODate(settings.targetDate)) return parseISODate(settings.targetDate);
  return addDays(new Date(), Number(settings.targetRangeDays || 365));
}
function accountName(id) { return store.data.accounts?.find(account => account.id === id)?.name || 'Unassigned'; }
function frequencyLabel(value) { return value === 'biweekly' ? 'Bi-weekly' : String(value || 'once').charAt(0).toUpperCase() + String(value || 'once').slice(1); }
function formatInsightValue(insight) {
  if (insight.kind === 'currency') return money(insight.value);
  if (insight.kind === 'percent') return `${Math.round(Number(insight.value || 0) * 100)}%`;
  if (insight.kind === 'days') return `${insight.value} day${insight.value === 1 ? '' : 's'}`;
  return String(insight.value ?? '');
}
function toast(message, tone = 'neutral') {
  const el = node('#toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setSelectOptions(select, options, selected = '', placeholder = '') {
  if (!select) return;
  const current = selected || select.value;
  clear(select);
  if (placeholder) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    select.append(option);
  }
  options.forEach(item => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  });
  if ([...select.options].some(option => option.value === current)) select.value = current;
}
function categoryOptions(kind = 'expense') {
  return (store.data.categories || [])
    .filter(category => category.kind === 'both' || category.kind === kind)
    .map(category => ({ value: category.id, label: category.name }));
}
function accountOptions() {
  return (store.data.accounts || []).map(account => ({ value: account.id, label: `${account.name} · ${money(account.balance)}` }));
}
function refreshSelects() {
  setSelectOptions(node('#quickCategory'), categoryOptions('expense'), node('#quickCategory')?.value || 'other');
  const transactionKind = node('#fieldType')?.value === 'incomes' ? 'income' : 'expense';
  setSelectOptions(node('#fieldCategory'), categoryOptions(transactionKind), node('#fieldCategory')?.value || (transactionKind === 'income' ? 'income' : 'other'));
  [node('#goalAccount'), node('#fundAccount')].forEach(select => setSelectOptions(select, accountOptions(), select?.value || '', 'Unassigned'));
}

function renderAccountSummary() {
  const root = node('#accountSummary');
  if (!root) return;
  clear(root);
  (store.data.accounts || []).forEach(account => {
    const item = document.createElement('div');
    item.className = 'account-mini-item';
    item.append(document.createTextNode(account.name));
    const strong = document.createElement('strong');
    strong.textContent = money(account.balance);
    item.append(strong);
    root.append(item);
  });
}

function renderCategoryBars(root, events) {
  if (!root) return;
  clear(root);
  const totals = categoryTotals(events);
  const max = totals[0]?.amount || 1;
  if (!totals.length) {
    const empty = document.createElement('div');
    empty.className = 'subtle';
    empty.textContent = 'No projected expenses in this range.';
    root.append(empty);
    return;
  }
  totals.slice(0, 8).forEach(row => {
    const wrapper = document.createElement('div'); wrapper.className = 'bar-row';
    const label = document.createElement('div'); label.className = 'bar-label'; label.textContent = categoryName(store.data, row.id);
    const track = document.createElement('div'); track.className = 'bar-track';
    const fill = document.createElement('div'); fill.className = 'bar-fill'; fill.style.width = `${Math.max(3, row.amount / max * 100)}%`; track.append(fill);
    const value = document.createElement('div'); value.className = 'bar-value'; value.textContent = money(row.amount);
    wrapper.append(label, track, value);
    root.append(wrapper);
  });
}

function renderRadarMini() {
  const root = node('#radarMini');
  if (!root) return;
  clear(root);
  buildInsights(store.data).slice(0, 4).forEach(insight => {
    const item = document.createElement('div'); item.className = 'radar-item';
    const dot = document.createElement('span'); dot.className = `radar-dot ${insight.tone}`;
    const copy = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = `${insight.title} · ${formatInsightValue(insight)}`;
    const detail = document.createElement('span'); detail.textContent = insight.detail;
    copy.append(title, detail); item.append(dot, copy); root.append(item);
  });
}

function renderOverview() {
  const from = startOfDay(new Date());
  const to = targetDate();
  const baseline = simulateBalance(store.data, to, from, { includeOverrides: false, includeScenario: false });
  const scenario = store.data.scenario?.enabled
    ? simulateBalance(store.data, to, from, { includeOverrides: false, includeScenario: true })
    : null;
  const twelve = next12Months(store.data, from, { includeOverrides: false });
  const thirty = cashflowWindow(store.data, 30, from, { includeOverrides: false });
  const events12 = itemsInRange(store.data, from, addDays(from, 365), { includeOverrides: false });

  currentSeries = baseline.series;
  scenarioSeries = scenario?.series || [];
  currentEvents = baseline.events;

  setText('#heroBalance', money(combinedBalance(store.data)));
  setText('#forecastBalance', money(baseline.endBalance));
  setText('#forecastDateLabel', `Projected ${toISODateLocal(to)}`);
  setText('#income12', money(twelve.income));
  setText('#expense12', money(twelve.expense));
  setText('#net12', money(twelve.net));
  setText('#cash30', money(thirty.net));
  setText('#cash30Note', `${money(thirty.income)} in · ${money(thirty.expense)} out`);

  const forecastBalance = node('#forecastBalance');
  if (forecastBalance) forecastBalance.className = `forecast-value ${statusClass(baseline.endBalance)}`;
  const net12 = node('#net12');
  if (net12) net12.className = `kpi-value ${statusClass(twelve.net)}`;
  const cash30 = node('#cash30');
  if (cash30) cash30.className = `kpi-value ${statusClass(thirty.net)}`;

  const scenarioActive = Boolean(store.data.scenario?.enabled);
  node('#scenarioBadge')?.classList.toggle('hidden', !scenarioActive);
  node('#scenarioLegend')?.classList.toggle('hidden', !scenarioActive);

  nodes('.range-pill').forEach(button => {
    const selected = store.data.settings?.targetMode === 'range' && Number(button.dataset.days) === Number(store.data.settings?.targetRangeDays);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  setValue('#targetDate', toISODateLocal(to));

  renderAccountSummary();
  renderCategoryBars(node('#categoryOverview'), events12);
  renderRadarMini();
  renderUpcoming();
  drawBalanceChart(node('#balanceChart'), currentSeries, { height: 300, comparisonSeries: scenarioSeries });

  const lastUpdate = store.data.settings?.lastBalanceUpdate;
  const note = lastUpdate ? `Balances updated ${new Date(lastUpdate).toLocaleDateString()} · local-only data` : 'Update account balances whenever you check in · local-only data';
  setText('#topbarStatus', note);
}

function renderUpcoming() {
  const tbody = node('#upcomingBody');
  if (!tbody) return;
  clear(tbody);
  const term = (node('#rangeSearch')?.value || '').trim().toLowerCase();
  let balance = combinedBalance(store.data);
  const rows = currentEvents
    .map(event => { balance += event.amount; return { ...event, balance }; })
    .filter(row => !term || row.description.toLowerCase().includes(term));

  rows.slice(0, 250).forEach(row => {
    const tr = document.createElement('tr');
    const desc = document.createElement('td');
    const dot = document.createElement('span'); dot.className = `transaction-dot ${row.type}`;
    desc.append(dot, document.createTextNode(row.description));
    const date = document.createElement('td'); date.textContent = toISODateLocal(row.date);
    const category = document.createElement('td'); category.textContent = categoryName(store.data, row.category);
    const amount = document.createElement('td'); amount.className = `number ${statusClass(row.amount)}`; amount.textContent = money(row.amount);
    const bal = document.createElement('td'); bal.className = `number ${statusClass(row.balance)}`; bal.textContent = money(row.balance);
    tr.append(desc, date, category, amount, bal);
    tbody.append(tr);
  });
  setText('#upcomingCount', `${rows.length} occurrence${rows.length === 1 ? '' : 's'}`);
}

function renderCalendar() {
  const root = node('#calendarGrid');
  if (!root) return;
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const gridEnd = addDays(gridStart, 41);
  const events = itemsInRange(store.data, gridStart, gridEnd, { includeOverrides: false });
  const byDay = new Map();
  events.forEach(event => {
    const key = toISODateLocal(event.date);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  });

  setText('#calendarTitle', first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  clear(root);
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    const iso = toISODateLocal(date);
    const dayEvents = byDay.get(iso) || [];
    const total = dayEvents.reduce((sum, event) => sum + event.amount, 0);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-day';
    if (date.getMonth() !== month) button.classList.add('outside');
    if (iso === todayISO()) button.classList.add('today');
    if (iso === selectedCalendarDate) button.classList.add('selected');
    const number = document.createElement('span'); number.className = 'day-number'; number.textContent = date.getDate(); button.append(number);
    if (dayEvents.length) {
      const value = document.createElement('div'); value.className = `day-total ${statusClass(total)}`; value.textContent = `${total >= 0 ? '+' : ''}${money(total)}`;
      const count = document.createElement('div'); count.className = 'day-count'; count.textContent = `${dayEvents.length} item${dayEvents.length === 1 ? '' : 's'}`;
      button.append(value, count);
    }
    button.onclick = () => { selectedCalendarDate = iso; renderCalendar(); };
    root.append(button);
  }
  renderCalendarDay(byDay.get(selectedCalendarDate) || []);
}

function renderCalendarDay(events) {
  const date = parseISODate(selectedCalendarDate);
  setText('#calendarDayTitle', date ? date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : selectedCalendarDate);
  const sum = events.reduce((total, event) => total + event.amount, 0);
  setText('#calendarDaySummary', events.length ? `${events.length} scheduled item${events.length === 1 ? '' : 's'} · net ${money(sum)}` : 'No scheduled cash flow');
  const root = node('#calendarDayEvents');
  if (!root) return;
  clear(root);
  if (!events.length) {
    const empty = document.createElement('div'); empty.className = 'subtle'; empty.textContent = 'Nothing scheduled for this day.'; root.append(empty); return;
  }
  events.forEach(event => {
    const row = document.createElement('div'); row.className = 'day-event'; row.style.gridTemplateColumns = '1fr auto';
    const copy = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = event.description;
    const meta = document.createElement('div'); meta.className = 'day-event-meta'; meta.textContent = `${categoryName(store.data, event.category)} · ${frequencyLabel(event.frequency)}`;
    copy.append(strong, meta);
    const amount = document.createElement('div'); amount.className = `number ${statusClass(event.amount)}`; amount.textContent = money(event.amount);
    row.append(copy, amount);
    root.append(row);
  });
}

function metricRow(label, value) {
  const row = document.createElement('div'); row.className = 'plan-metric';
  const a = document.createElement('span'); a.textContent = label;
  const b = document.createElement('strong'); b.textContent = value;
  row.append(a, b); return row;
}

function renderGoals() {
  const root = node('#goalsGrid');
  if (!root) return;
  clear(root);
  if (!(store.data.goals || []).length) {
    const empty = document.createElement('div'); empty.className = 'empty-state surface-card'; empty.textContent = 'No goals yet. Add a goal to track progress automatically.'; root.append(empty); return;
  }
  store.data.goals.forEach(goal => {
    const metrics = goalMetrics(store.data, goal);
    const card = document.createElement('section'); card.className = 'surface-card plan-card';
    const head = document.createElement('div'); head.className = 'plan-card-head';
    const title = document.createElement('div'); const h3 = document.createElement('h3'); h3.textContent = goal.name;
    const source = document.createElement('div'); source.className = 'subtle'; source.textContent = goal.source === 'cash' ? 'Total cash' : goal.source === 'account' ? accountName(goal.accountId) : 'Manual';
    title.append(h3, source);
    const edit = document.createElement('button'); edit.className = 'icon-button'; edit.type = 'button'; edit.textContent = 'Edit'; edit.onclick = () => openGoalDialog(goal);
    head.append(title, edit);
    const track = document.createElement('div'); track.className = 'progress-track';
    const fill = document.createElement('div'); fill.className = 'progress-fill'; fill.style.width = `${Math.round(metrics.progress * 100)}%`; track.append(fill);
    card.append(head, track, metricRow('Progress', `${Math.round(metrics.progress * 100)}%`), metricRow('Current', money(metrics.current)), metricRow('Target', money(metrics.target)), metricRow('Remaining', money(metrics.remaining)));
    if (metrics.monthlyRequired !== null) card.append(metricRow('Monthly needed', money(metrics.monthlyRequired)));
    const del = document.createElement('button'); del.className = 'text-button danger-text'; del.type = 'button'; del.textContent = 'Delete goal'; del.onclick = () => { if (confirm(`Delete “${goal.name}”?`)) mutations.removeGoal(goal.id); };
    card.append(del); root.append(card);
  });
}

function renderFunds() {
  const root = node('#fundsGrid');
  if (!root) return;
  clear(root);
  if (!(store.data.funds || []).length) {
    const empty = document.createElement('div'); empty.className = 'empty-state surface-card'; empty.textContent = 'No sinking funds yet. Create one for a large future bill.'; root.append(empty);
  }
  (store.data.funds || []).forEach(fund => {
    const metrics = fundMetrics(fund);
    const card = document.createElement('section'); card.className = 'surface-card plan-card fund-card';
    const head = document.createElement('div'); head.className = 'plan-card-head';
    const wrap = document.createElement('div'); const h3 = document.createElement('h3'); h3.textContent = fund.name;
    const due = document.createElement('div'); due.className = 'subtle'; due.textContent = fund.dueDate ? `Due ${fund.dueDate}` : 'No due date'; wrap.append(h3, due);
    const edit = document.createElement('button'); edit.className = 'icon-button'; edit.type = 'button'; edit.textContent = 'Edit'; edit.onclick = () => openFundDialog(fund);
    head.append(wrap, edit);
    const track = document.createElement('div'); track.className = 'progress-track'; const fill = document.createElement('div'); fill.className = 'progress-fill'; fill.style.width = `${Math.round(metrics.progress * 100)}%`; track.append(fill);
    card.append(head, track, metricRow('Reserved', money(metrics.reserved)), metricRow('Target', money(metrics.target)), metricRow('Remaining', money(metrics.remaining)));
    if (metrics.weeklyRequired !== null) card.append(metricRow('Per week', money(metrics.weeklyRequired)), metricRow('Per month', money(metrics.monthlyRequired)));
    const del = document.createElement('button'); del.className = 'text-button danger-text'; del.type = 'button'; del.textContent = 'Delete fund'; del.onclick = () => { if (confirm(`Delete “${fund.name}”?`)) mutations.removeFund(fund.id); };
    card.append(del); root.append(card);
  });

  const suggestions = node('#fundSuggestions');
  if (!suggestions) return;
  clear(suggestions);
  const rows = suggestedFunds(store.data);
  if (!rows.length) {
    const empty = document.createElement('div'); empty.className = 'subtle'; empty.textContent = 'No unplanned large obligations detected in the next 24 months.'; suggestions.append(empty);
  }
  rows.forEach(item => {
    const row = document.createElement('div'); row.className = 'suggestion-row';
    const copy = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = item.name; const meta = document.createElement('span'); meta.textContent = `${money(item.targetAmount)} · due ${item.dueDate}`; copy.append(strong, meta);
    const category = document.createElement('span'); category.textContent = categoryName(store.data, item.category);
    const button = document.createElement('button'); button.className = 'button small'; button.type = 'button'; button.textContent = 'Create fund'; button.onclick = () => openFundDialog({ name: item.name, targetAmount: item.targetAmount, reservedAmount: 0, dueDate: item.dueDate, linkedExpenseId: item.expenseId, accountId: '' }, true);
    row.append(copy, category, button); suggestions.append(row);
  });
}

function renderScenario() {
  const scenario = store.data.scenario || {};
  const enabled = node('#scenarioEnabled'); if (enabled) enabled.checked = Boolean(scenario.enabled);
  setValue('#scenarioName', scenario.name || '');
  setValue('#scenarioIncome', Number(scenario.monthlyIncomeDelta || 0));
  setValue('#scenarioExpense', Number(scenario.monthlyExpenseDelta || 0));
  setValue('#scenarioOneTime', Number(scenario.oneTimeDelta || 0));
  setValue('#scenarioOneTimeDate', scenario.oneTimeDate || '');
  const summary = node('#scenarioSummary');
  if (summary) {
    const to = addDays(new Date(), 365);
    const baseline = simulateBalance(store.data, to, new Date(), { includeOverrides: false, includeScenario: false });
    const withScenario = simulateBalance(store.data, to, new Date(), { includeOverrides: false, includeScenario: true });
    const delta = withScenario.endBalance - baseline.endBalance;
    clear(summary);
    summary.append(document.createTextNode('12-month impact: '));
    const strong = document.createElement('strong'); strong.textContent = `${delta >= 0 ? '+' : ''}${money(delta)}`; summary.append(strong);
  }
}
function renderPlan() { renderGoals(); renderFunds(); renderScenario(); }

function renderInsights() {
  const root = node('#insightsGrid');
  if (!root) return;
  clear(root);
  buildInsights(store.data).forEach(insight => {
    const card = document.createElement('section'); card.className = 'surface-card insight-card';
    const dot = document.createElement('div'); dot.className = `insight-tone ${insight.tone}`;
    const title = document.createElement('div'); title.className = 'insight-title'; title.textContent = insight.title;
    const value = document.createElement('div'); value.className = 'insight-value'; value.textContent = formatInsightValue(insight);
    const detail = document.createElement('div'); detail.className = 'insight-detail'; detail.textContent = insight.detail;
    card.append(dot, title, value, detail); root.append(card);
  });
  const events = itemsInRange(store.data, new Date(), addDays(new Date(), 365), { includeOverrides: false });
  renderCategoryBars(node('#categoryInsights'), events);
  const commitments = node('#commitmentSummary');
  if (commitments) {
    clear(commitments);
    const recurringExpenses = (store.data.expenses || []).filter(item => item.frequency !== 'once').reduce((sum, item) => sum + annualized(item), 0);
    const recurringIncome = (store.data.incomes || []).filter(item => item.frequency !== 'once').reduce((sum, item) => sum + annualized(item), 0);
    commitments.append(commitmentRow('Recurring income', recurringIncome, 'positive'), commitmentRow('Recurring expenses', recurringExpenses, 'negative'), commitmentRow('Recurring margin', recurringIncome - recurringExpenses, statusClass(recurringIncome - recurringExpenses)));
  }
}
function commitmentRow(label, amount, tone) {
  const row = document.createElement('div'); row.className = 'commitment-row';
  const span = document.createElement('span'); span.textContent = label;
  const strong = document.createElement('strong'); strong.className = tone; strong.textContent = money(amount);
  row.append(span, strong); return row;
}

function renderTransactions(type) {
  const root = node(`#${type}List`);
  if (!root) return;
  clear(root);
  ['once', 'weekly', 'biweekly', 'monthly', 'yearly'].forEach(frequency => {
    const items = (store.data[type] || []).filter(item => item.frequency === frequency).sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
    if (!items.length) return;
    const section = document.createElement('section'); section.className = 'transaction-group surface-card';
    const header = document.createElement('div'); header.className = 'group-header';
    const wrap = document.createElement('div'); const title = document.createElement('h3'); title.textContent = frequencyLabel(frequency);
    const meta = document.createElement('p'); meta.textContent = `${items.length} item${items.length === 1 ? '' : 's'} · ${money(items.reduce((sum, item) => sum + annualized(item), 0))}/yr`; wrap.append(title, meta); header.append(wrap); section.append(header);
    const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap';
    const table = document.createElement('table'); table.innerHTML = '<thead><tr><th>Description</th><th>Category</th><th>Amount</th><th>Start</th><th>End</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    items.forEach(item => {
      const tr = document.createElement('tr');
      const desc = document.createElement('td'); desc.textContent = item.description;
      const cat = document.createElement('td'); cat.textContent = categoryName(store.data, item.category);
      const amount = document.createElement('td'); amount.className = 'number'; amount.textContent = money(item.amount);
      const start = document.createElement('td'); start.textContent = item.date;
      const end = document.createElement('td'); end.textContent = item.endDate || '—';
      const actions = document.createElement('td'); actions.className = 'row-actions';
      const edit = document.createElement('button'); edit.className = 'icon-button'; edit.type = 'button'; edit.textContent = 'Edit'; edit.onclick = () => openTransactionDialog(type, item);
      const del = document.createElement('button'); del.className = 'icon-button danger-text'; del.type = 'button'; del.textContent = 'Delete'; del.onclick = () => { if (confirm(`Delete “${item.description}”?`)) mutations.remove(type, item.id); };
      actions.append(edit, del); tr.append(desc, cat, amount, start, end, actions); tbody.append(tr);
    });
    table.append(tbody); tableWrap.append(table); section.append(tableWrap); root.append(section);
  });
  if (!root.childNodes.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state surface-card'; empty.textContent = `No ${type === 'incomes' ? 'income' : 'expenses'} yet.`; root.append(empty);
  }
}

function renderSettings() {
  const accounts = node('#accountsList');
  if (accounts) {
    clear(accounts);
    (store.data.accounts || []).forEach(account => {
      const row = document.createElement('div'); row.className = 'settings-row';
      const copy = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = account.name; const meta = document.createElement('div'); meta.className = 'settings-row-meta'; meta.textContent = account.type; copy.append(strong, meta);
      const amount = document.createElement('strong'); amount.textContent = money(account.balance);
      const actions = document.createElement('div');
      const edit = document.createElement('button'); edit.className = 'icon-button'; edit.type = 'button'; edit.textContent = 'Edit'; edit.onclick = () => openAccountDialog(account); actions.append(edit);
      if ((store.data.accounts || []).length > 1) {
        const del = document.createElement('button'); del.className = 'icon-button danger-text'; del.type = 'button'; del.textContent = 'Delete'; del.onclick = () => { if (confirm(`Delete account “${account.name}”?`)) mutations.removeAccount(account.id); }; actions.append(del);
      }
      row.append(copy, amount, actions); accounts.append(row);
    });
  }
  const cats = node('#categoriesList');
  if (cats) {
    clear(cats);
    (store.data.categories || []).forEach(category => {
      const chip = document.createElement('span'); chip.className = 'category-chip'; chip.append(document.createTextNode(category.name));
      if (!defaultCategoryIds.has(category.id)) {
        const del = document.createElement('button'); del.type = 'button'; del.textContent = '×'; del.title = 'Delete category'; del.onclick = () => mutations.removeCategory(category.id); chip.append(del);
      }
      cats.append(chip);
    });
  }
  setValue('#themeSelect', store.data.settings?.theme || 'dark');
  setText('#appVersion', APP_VERSION);
  const last = store.data.settings?.lastBalanceUpdate;
  setText('#lastBalanceUpdate', last ? new Date(last).toLocaleString() : 'Not recorded yet');
}

function renderAll() {
  setTheme(store.data.settings?.theme || 'dark');
  refreshSelects();
  renderOverview();
  renderCalendar();
  renderPlan();
  renderInsights();
  renderTransactions('expenses');
  renderTransactions('incomes');
  renderSettings();
}

function switchView(view) {
  activeView = view;
  nodes('.nav-item').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  nodes('.view').forEach(section => section.classList.toggle('active', section.id === `view-${view}`));
  document.title = `${view === 'overview' ? 'Dashboard' : view.charAt(0).toUpperCase() + view.slice(1)} · Finance Planner`;
  if (view === 'overview') requestAnimationFrame(renderOverview);
  if (view === 'calendar') requestAnimationFrame(renderCalendar);
}

function openTransactionDialog(type, item = null) {
  editingId = item?.id || null;
  editingType = type;
  setText('#dialogTitle', `${item ? 'Edit' : 'Add'} ${type === 'incomes' ? 'income' : 'expense'}`);
  setValue('#fieldType', type === 'incomes' ? 'incomes' : 'expenses');
  setValue('#fieldDescription', item?.description || '');
  setValue('#fieldAmount', item?.amount ?? '');
  setValue('#fieldDate', item?.date || todayISO());
  setValue('#fieldEndDate', item?.endDate || '');
  setValue('#fieldFrequency', item?.frequency || 'monthly');
  refreshSelects();
  setValue('#fieldCategory', item?.category || (type === 'incomes' ? 'income' : 'other'));
  node('#transactionDialog')?.showModal();
  setTimeout(() => node('#fieldDescription')?.focus(), 0);
}
function saveTransaction(event) {
  event.preventDefault();
  const amount = parseAmount(node('#fieldAmount')?.value);
  const description = (node('#fieldDescription')?.value || '').trim();
  const date = node('#fieldDate')?.value || '';
  const endDate = node('#fieldEndDate')?.value || '';
  if (!description || amount === null || amount < 0 || !parseISODate(date)) return toast('Enter a description, valid date, and non-negative amount.', 'danger');
  if (endDate && (!parseISODate(endDate) || endDate < date)) return toast('End date must be on or after the start date.', 'danger');
  const nextType = node('#fieldType')?.value === 'incomes' ? 'incomes' : 'expenses';
  const kind = nextType === 'incomes' ? 'income' : 'expense';
  const item = {
    id: editingId || uuid(), description, amount, date, endDate,
    frequency: node('#fieldFrequency')?.value || 'once',
    category: node('#fieldCategory')?.value || suggestCategory(description, kind),
    accountId: ''
  };
  if (editingId) mutations.update(editingType, editingId, nextType, item); else mutations.add(nextType, item);
  node('#transactionDialog')?.close();
  toast(editingId ? 'Transaction updated.' : 'Transaction added.', 'success');
}
function quickAdd(type) {
  const description = (node('#quickDescription')?.value || '').trim();
  const amount = parseAmount(node('#quickAmount')?.value);
  const date = node('#quickDate')?.value || todayISO();
  if (!description || amount === null || amount <= 0) return toast('Add a description and amount.', 'danger');
  mutations.add(type, {
    description, amount, date, endDate: '', frequency: node('#quickFrequency')?.value || 'monthly',
    category: type === 'incomes' ? 'income' : (node('#quickCategory')?.value || suggestCategory(description, 'expense')),
    accountId: ''
  });
  setValue('#quickDescription', ''); setValue('#quickAmount', '');
  toast(type === 'incomes' ? 'Income added.' : 'Expense added.', 'success');
}

function openGoalDialog(goal = null) {
  editingGoalId = goal?.id || null;
  setText('#goalDialogTitle', goal ? 'Edit goal' : 'Add goal');
  setValue('#goalName', goal?.name || ''); setValue('#goalTarget', goal?.targetAmount ?? ''); setValue('#goalSource', goal?.source || 'cash'); setValue('#goalCurrent', goal?.currentAmount ?? 0); refreshSelects(); setValue('#goalAccount', goal?.accountId || ''); setValue('#goalDate', goal?.targetDate || '');
  node('#goalDialog')?.showModal();
}
function saveGoal(event) {
  event.preventDefault();
  const raw = { name: node('#goalName')?.value, targetAmount: node('#goalTarget')?.value, source: node('#goalSource')?.value, currentAmount: node('#goalCurrent')?.value, accountId: node('#goalAccount')?.value, targetDate: node('#goalDate')?.value };
  if (editingGoalId) mutations.updateGoal(editingGoalId, raw); else mutations.addGoal(raw);
  node('#goalDialog')?.close(); toast('Goal saved.', 'success');
}
function openFundDialog(fund = null, suggestion = false) {
  editingFundId = suggestion ? null : (fund?.id || null);
  setText('#fundDialogTitle', editingFundId ? 'Edit sinking fund' : 'Add sinking fund');
  setValue('#fundName', fund?.name || ''); setValue('#fundTarget', fund?.targetAmount ?? ''); setValue('#fundReserved', fund?.reservedAmount ?? 0); setValue('#fundDate', fund?.dueDate || ''); refreshSelects(); setValue('#fundAccount', fund?.accountId || ''); setValue('#fundLinkedExpense', fund?.linkedExpenseId || '');
  node('#fundDialog')?.showModal();
}
function saveFund(event) {
  event.preventDefault();
  const raw = { name: node('#fundName')?.value, targetAmount: node('#fundTarget')?.value, reservedAmount: node('#fundReserved')?.value, dueDate: node('#fundDate')?.value, accountId: node('#fundAccount')?.value, linkedExpenseId: node('#fundLinkedExpense')?.value };
  if (editingFundId) mutations.updateFund(editingFundId, raw); else mutations.addFund(raw);
  node('#fundDialog')?.close(); toast('Sinking fund saved.', 'success');
}
function openAccountDialog(account = null) {
  editingAccountId = account?.id || null;
  setText('#accountDialogTitle', account ? 'Edit account' : 'Add account');
  setValue('#accountName', account?.name || ''); setValue('#accountType', account?.type || 'checking'); setValue('#accountBalance', account?.balance ?? 0);
  node('#accountDialog')?.showModal();
}
function saveAccount(event) {
  event.preventDefault();
  const raw = { name: node('#accountName')?.value, type: node('#accountType')?.value, balance: node('#accountBalance')?.value };
  if (editingAccountId) mutations.updateAccount(editingAccountId, raw); else mutations.addAccount(raw);
  node('#accountDialog')?.close(); toast('Account saved.', 'success');
}
function saveCategory(event) {
  event.preventDefault();
  const ok = mutations.addCategory({ name: node('#categoryName')?.value, kind: node('#categoryKind')?.value });
  if (!ok) return toast('That category already exists.', 'danger');
  node('#categoryDialog')?.close(); setValue('#categoryName', ''); toast('Category added.', 'success');
}
function saveScenario() {
  mutations.saveScenario({
    enabled: Boolean(node('#scenarioEnabled')?.checked),
    name: node('#scenarioName')?.value,
    monthlyIncomeDelta: node('#scenarioIncome')?.value,
    monthlyExpenseDelta: node('#scenarioExpense')?.value,
    oneTimeDelta: node('#scenarioOneTime')?.value,
    oneTimeDate: node('#scenarioOneTimeDate')?.value
  });
  toast('Scenario saved.', 'success');
}

function openBalanceDialog() {
  const root = node('#balanceFields');
  if (!root) return;
  clear(root);
  (store.data.accounts || []).forEach(account => {
    const field = document.createElement('div'); field.className = 'field';
    const label = document.createElement('label'); label.textContent = account.name;
    const input = document.createElement('input'); input.className = 'input'; input.type = 'number'; input.step = '0.01'; input.inputMode = 'decimal'; input.value = Number(account.balance || 0); input.dataset.accountId = account.id;
    field.append(label, input); root.append(field);
  });
  setText('#balanceDialogTotal', money(combinedBalance(store.data)));
  node('#balanceDialog')?.showModal();
}
function saveBalanceCheckIn(event) {
  event.preventDefault();
  const inputs = nodes('#balanceFields [data-account-id]');
  let invalid = false;
  inputs.forEach(input => {
    const amount = parseAmount(input.value);
    if (amount === null) { invalid = true; return; }
    const account = store.data.accounts.find(item => item.id === input.dataset.accountId);
    if (account) account.balance = amount;
  });
  if (invalid) return toast('Enter a valid balance for each account.', 'danger');
  store.data.settings.lastBalanceUpdate = new Date().toISOString();
  store.data.occurrenceOverrides = {};
  store.save();
  node('#balanceDialog')?.close();
  toast('Balances updated. Forecast rebased from today.', 'success');
}

function bindEvents() {
  nodes('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  nodes('[data-view-jump]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.viewJump)));
  on('#topBackup', 'click', () => switchView('settings'));
  on('#topBalance', 'click', openBalanceDialog);
  on('#balanceForm', 'submit', saveBalanceCheckIn);
  on('#balanceCancel', 'click', () => node('#balanceDialog')?.close());

  on('#addExpense', 'click', () => openTransactionDialog('expenses'));
  on('#addIncome', 'click', () => openTransactionDialog('incomes'));
  on('#transactionForm', 'submit', saveTransaction);
  on('#dialogCancel', 'click', () => node('#transactionDialog')?.close());
  on('#fieldType', 'change', refreshSelects);
  on('#fieldDescription', 'blur', () => {
    const kind = node('#fieldType')?.value === 'incomes' ? 'income' : 'expense';
    const suggestion = suggestCategory(node('#fieldDescription')?.value, kind);
    const select = node('#fieldCategory');
    if (select && [...select.options].some(option => option.value === suggestion)) select.value = suggestion;
  });

  nodes('.range-pill').forEach(button => button.addEventListener('click', () => {
    store.data.settings.targetMode = 'range';
    store.data.settings.targetRangeDays = Number(button.dataset.days);
    store.data.settings.targetDate = '';
    store.save();
  }));
  on('#targetDate', 'change', event => {
    if (!parseISODate(event.target.value)) return;
    store.data.settings.targetMode = 'date'; store.data.settings.targetDate = event.target.value; store.save();
  });

  setValue('#quickDate', todayISO());
  on('#quickIncome', 'click', () => quickAdd('incomes'));
  on('#quickExpense', 'click', () => quickAdd('expenses'));
  on('#rangeSearch', 'input', debounce(renderUpcoming, 100));

  on('#calendarPrev', 'click', () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); selectedCalendarDate = toISODateLocal(calendarCursor); renderCalendar(); });
  on('#calendarNext', 'click', () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); selectedCalendarDate = toISODateLocal(calendarCursor); renderCalendar(); });
  on('#calendarToday', 'click', () => { const now = new Date(); calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1); selectedCalendarDate = todayISO(); renderCalendar(); });

  on('#addGoal', 'click', () => openGoalDialog()); on('#goalForm', 'submit', saveGoal); on('#goalCancel', 'click', () => node('#goalDialog')?.close());
  on('#addFund', 'click', () => openFundDialog()); on('#fundForm', 'submit', saveFund); on('#fundCancel', 'click', () => node('#fundDialog')?.close());
  on('#saveScenario', 'click', saveScenario);
  on('#addAccount', 'click', () => openAccountDialog()); on('#accountForm', 'submit', saveAccount); on('#accountCancel', 'click', () => node('#accountDialog')?.close());
  on('#addCategory', 'click', () => node('#categoryDialog')?.showModal()); on('#categoryForm', 'submit', saveCategory); on('#categoryCancel', 'click', () => node('#categoryDialog')?.close());

  on('#themeSelect', 'change', event => { store.data.settings.theme = event.target.value; store.save(); });
  on('#exportData', 'click', () => downloadText(`finance-planner-${todayISO()}.json`, JSON.stringify(store.data, null, 2)));
  on('#importFile', 'change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const diagnostics = store.import(data);
      toast(diagnostics.length ? `Imported with ${diagnostics.length} note${diagnostics.length === 1 ? '' : 's'}.` : 'Backup imported.', diagnostics.length ? 'warning' : 'success');
      if (diagnostics.length) console.warn('Import diagnostics', diagnostics);
    } catch (error) {
      console.error(error); toast('That file is not a valid Finance Planner backup.', 'danger');
    } finally { event.target.value = ''; }
  });
  on('#resetData', 'click', () => {
    if (!confirm('Reset all Finance Planner data on this browser? Export a backup first if you may need it later.')) return;
    localStorage.removeItem('planner_v2'); localStorage.removeItem('planner_v2_backup'); location.reload();
  });

  window.addEventListener('resize', debounce(() => activeView === 'overview' && drawBalanceChart(node('#balanceChart'), currentSeries, { height: 300, comparisonSeries: scenarioSeries }), 120));
}

store.subscribe(renderAll);
bindEvents();
renderAll();
switchView('overview');
setText('#brandVersion', `v${APP_VERSION}`);
window.FinancePlanner = { version: APP_VERSION, ranges: RANGE_OPTIONS };
