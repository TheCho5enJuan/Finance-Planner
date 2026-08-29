import { APP_VERSION, RANGE_OPTIONS } from './constants.js';
import { store, mutations } from './store.js';
import { actualVsPlanned, annualized, cashflowWindow, combinedBalance, itemsInRange, next12Months, simulateBalance } from './forecast.js';
import { drawBalanceChart } from './charts.js';
import { DEFAULT_CATEGORIES, categoryName, categoryTotals, suggestCategory } from './categories.js';
import { buildInsights } from './insights.js';
import { fundMetrics, goalMetrics, planTotals, suggestedFunds } from './planning.js';
import { $, $$, addDays, debounce, downloadText, money, parseAmount, parseISODate, startOfDay, todayISO, toISODateLocal, uuid } from './utils.js';

let activeView = 'overview';
let editingId = null;
let editingType = 'expenses';
let editingGoalId = null;
let editingFundId = null;
let editingAccountId = null;
let reconcilingEvent = null;
let currentSeries = [];
let scenarioSeries = [];
let currentEvents = [];
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = todayISO();

const defaultCategoryIds = new Set(DEFAULT_CATEGORIES.map(category => category.id));

function setText(selector, text) { const node = $(selector); if (node) node.textContent = text; }
function clear(node) { if (node) node.replaceChildren(); }
function statusClass(value) { return value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'; }
function setTheme(theme) { document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'; document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark'; }
function targetDate() {
  const settings = store.data.settings;
  if (settings.targetMode === 'date' && parseISODate(settings.targetDate)) return parseISODate(settings.targetDate);
  return addDays(new Date(), Number(settings.targetRangeDays || 365));
}
function accountName(id) { return store.data.accounts.find(account => account.id === id)?.name || 'Unassigned'; }
function frequencyLabel(value) { return value === 'biweekly' ? 'Bi-weekly' : value.charAt(0).toUpperCase() + value.slice(1); }
function formatInsightValue(insight) {
  if (insight.kind === 'currency') return money(insight.value);
  if (insight.kind === 'percent') return `${Math.round(Number(insight.value || 0) * 100)}%`;
  if (insight.kind === 'days') return `${insight.value} day${insight.value === 1 ? '' : 's'}`;
  return String(insight.value ?? '');
}
function toast(message, tone = 'neutral') {
  const node = $('#toast'); if (!node) return;
  node.textContent = message; node.dataset.tone = tone; node.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
}

function setSelectOptions(select, options, selected = '', placeholder = '') {
  if (!select) return;
  const current = selected || select.value;
  clear(select);
  if (placeholder) { const option = document.createElement('option'); option.value = ''; option.textContent = placeholder; select.append(option); }
  options.forEach(item => { const option = document.createElement('option'); option.value = item.value; option.textContent = item.label; select.append(option); });
  if ([...select.options].some(option => option.value === current)) select.value = current;
}
function categoryOptions(kind = 'expense') {
  return store.data.categories.filter(category => category.kind === 'both' || category.kind === kind).map(category => ({ value: category.id, label: category.name }));
}
function accountOptions() { return store.data.accounts.map(account => ({ value: account.id, label: `${account.name} · ${money(account.balance)}` })); }
function refreshSelects() {
  setSelectOptions($('#quickCategory'), categoryOptions('expense'), $('#quickCategory')?.value || 'other');
  const transactionKind = $('#fieldType')?.value === 'incomes' ? 'income' : 'expense';
  setSelectOptions($('#fieldCategory'), categoryOptions(transactionKind), $('#fieldCategory')?.value || (transactionKind === 'income' ? 'income' : 'other'));
  [$('#fieldAccount'), $('#goalAccount'), $('#fundAccount'), $('#occurrenceAccount')].forEach(select => setSelectOptions(select, accountOptions(), select?.value || '', 'Unassigned'));
}

function renderAccountSummary() {
  const root = $('#accountSummary'); clear(root);
  store.data.accounts.forEach(account => {
    const item = document.createElement('div'); item.className = 'account-mini-item';
    item.append(document.createTextNode(account.name)); const strong = document.createElement('strong'); strong.textContent = money(account.balance); item.append(strong); root.append(item);
  });
}

function renderCategoryBars(root, events) {
  clear(root); const totals = categoryTotals(events); const max = totals[0]?.amount || 1;
  if (!totals.length) { const empty = document.createElement('div'); empty.className = 'subtle'; empty.textContent = 'No projected expenses in this range.'; root.append(empty); return; }
  totals.slice(0, 8).forEach(row => {
    const wrapper = document.createElement('div'); wrapper.className = 'bar-row';
    const label = document.createElement('div'); label.className = 'bar-label'; label.textContent = categoryName(store.data, row.id);
    const track = document.createElement('div'); track.className = 'bar-track'; const fill = document.createElement('div'); fill.className = 'bar-fill'; fill.style.width = `${Math.max(3, row.amount / max * 100)}%`; track.append(fill);
    const value = document.createElement('div'); value.className = 'bar-value'; value.textContent = money(row.amount);
    wrapper.append(label, track, value); root.append(wrapper);
  });
}

function renderRadarMini() {
  const root = $('#radarMini'); clear(root);
  buildInsights(store.data).slice(0, 4).forEach(insight => {
    const item = document.createElement('div'); item.className = 'radar-item';
    const dot = document.createElement('span'); dot.className = `radar-dot ${insight.tone}`;
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = `${insight.title} · ${formatInsightValue(insight)}`; const detail = document.createElement('span'); detail.textContent = insight.detail;
    copy.append(title, detail); item.append(dot, copy); root.append(item);
  });
}

function renderOverview() {
  const from = startOfDay(new Date()); const to = targetDate();
  const baseline = simulateBalance(store.data, to, from, { includeScenario: false });
  const scenario = store.data.scenario?.enabled ? simulateBalance(store.data, to, from, { includeScenario: true }) : null;
  const twelve = next12Months(store.data, from); const actual = actualVsPlanned(store.data, from); const events12 = itemsInRange(store.data, from, addDays(from, 365));
  currentSeries = baseline.series; scenarioSeries = scenario?.series || []; currentEvents = baseline.events;
  setText('#heroBalance', money(combinedBalance(store.data))); setText('#forecastBalance', money(baseline.endBalance)); setText('#forecastDateLabel', `Projected ${toISODateLocal(to)}`);
  setText('#income12', money(twelve.income)); setText('#expense12', money(twelve.expense)); setText('#net12', money(twelve.net)); setText('#varianceNow', money(actual.variance));
  setText('#varianceNote', actual.unreconciled ? `${actual.unreconciled} occurrence${actual.unreconciled === 1 ? '' : 's'} not reconciled` : 'Plan is fully reconciled since tracking began');
  $('#forecastBalance').className = `forecast-value ${statusClass(baseline.endBalance)}`; $('#net12').className = `kpi-value ${statusClass(twelve.net)}`; $('#varianceNow').className = `kpi-value ${statusClass(actual.variance)}`;
  const scenarioActive = Boolean(store.data.scenario?.enabled); $('#scenarioBadge').classList.toggle('hidden', !scenarioActive); $('#scenarioLegend').classList.toggle('hidden', !scenarioActive);
  $$('.range-pill').forEach(button => { const selected = store.data.settings.targetMode === 'range' && Number(button.dataset.days) === Number(store.data.settings.targetRangeDays); button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); });
  $('#targetDate').value = toISODateLocal(to); renderAccountSummary(); renderCategoryBars($('#categoryOverview'), events12); renderRadarMini(); renderUpcoming();
  drawBalanceChart($('#balanceChart'), currentSeries, { height: 300, comparisonSeries: scenarioSeries });
  setText('#topbarStatus', actual.unreconciled ? `${actual.unreconciled} unreconciled · local-only data` : 'Plan reconciled · local-only data');
}

function renderUpcoming() {
  const tbody = $('#upcomingBody'); clear(tbody); const term = ($('#rangeSearch')?.value || '').trim().toLowerCase(); let balance = combinedBalance(store.data);
  const rows = currentEvents.map(event => { balance += event.amount; return { ...event, balance }; }).filter(row => !term || row.description.toLowerCase().includes(term));
  rows.slice(0, 250).forEach(row => {
    const tr = document.createElement('tr');
    const desc = document.createElement('td'); const dot = document.createElement('span'); dot.className = `transaction-dot ${row.type}`; desc.append(dot, document.createTextNode(row.description));
    const date = document.createElement('td'); date.textContent = toISODateLocal(row.date);
    const category = document.createElement('td'); category.textContent = categoryName(store.data, row.category);
    const status = document.createElement('td'); const pill = document.createElement('span'); pill.className = `status-pill ${row.status}`; pill.textContent = row.status; status.append(pill);
    const amount = document.createElement('td'); amount.className = `number ${statusClass(row.amount)}`; amount.textContent = money(row.amount);
    const bal = document.createElement('td'); bal.className = `number ${statusClass(row.balance)}`; bal.textContent = money(row.balance);
    const actions = document.createElement('td'); const reconcile = document.createElement('button'); reconcile.className = 'icon-button'; reconcile.type = 'button'; reconcile.textContent = 'Reconcile'; reconcile.onclick = () => openOccurrenceDialog(row); actions.append(reconcile);
    tr.append(desc, date, category, status, amount, bal, actions); tbody.append(tr);
  });
  setText('#upcomingCount', `${rows.length} occurrence${rows.length === 1 ? '' : 's'}`);
}

function renderCalendar() {
  const year = calendarCursor.getFullYear(), month = calendarCursor.getMonth(); const first = new Date(year, month, 1); const gridStart = new Date(year, month, 1 - first.getDay()); const gridEnd = addDays(gridStart, 41);
  const events = itemsInRange(store.data, gridStart, gridEnd); const byDay = new Map();
  events.forEach(event => { const key = toISODateLocal(event.date); if (!byDay.has(key)) byDay.set(key, []); byDay.get(key).push(event); });
  setText('#calendarTitle', first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })); const root = $('#calendarGrid'); clear(root);
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i); const iso = toISODateLocal(date); const dayEvents = byDay.get(iso) || []; const total = dayEvents.reduce((sum, event) => sum + event.amount, 0);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-day';
    if (date.getMonth() !== month) button.classList.add('outside'); if (iso === todayISO()) button.classList.add('today'); if (iso === selectedCalendarDate) button.classList.add('selected');
    const number = document.createElement('span'); number.className = 'day-number'; number.textContent = date.getDate(); button.append(number);
    if (dayEvents.length) { const value = document.createElement('div'); value.className = `day-total ${statusClass(total)}`; value.textContent = `${total >= 0 ? '+' : ''}${money(total)}`; const count = document.createElement('div'); count.className = 'day-count'; count.textContent = `${dayEvents.length} item${dayEvents.length === 1 ? '' : 's'}`; button.append(value, count); }
    button.onclick = () => { selectedCalendarDate = iso; renderCalendar(); }; root.append(button);
  }
  renderCalendarDay(byDay.get(selectedCalendarDate) || []);
}

function renderCalendarDay(events) {
  const date = parseISODate(selectedCalendarDate); setText('#calendarDayTitle', date ? date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : selectedCalendarDate);
  const sum = events.reduce((total, event) => total + event.amount, 0); setText('#calendarDaySummary', events.length ? `${events.length} occurrence${events.length === 1 ? '' : 's'} · net ${money(sum)}` : 'No scheduled cash flow');
  const root = $('#calendarDayEvents'); clear(root);
  if (!events.length) { const empty = document.createElement('div'); empty.className = 'subtle'; empty.textContent = 'Nothing scheduled for this day.'; root.append(empty); return; }
  events.forEach(event => {
    const row = document.createElement('div'); row.className = 'day-event'; const copy = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = event.description; const meta = document.createElement('div'); meta.className = 'day-event-meta'; meta.textContent = `${categoryName(store.data, event.category)} · ${event.status}`; copy.append(strong, meta);
    const amount = document.createElement('div'); amount.className = `number ${statusClass(event.amount)}`; amount.textContent = money(event.amount);
    const action = document.createElement('button'); action.className = 'button small'; action.type = 'button'; action.textContent = 'Reconcile'; action.onclick = () => openOccurrenceDialog(event);
    row.append(copy, amount, action); root.append(row);
  });
}

function renderGoals() {
  const root = $('#goalsGrid'); clear(root);
  if (!store.data.goals.length) { const empty = document.createElement('div'); empty.className = 'empty-state surface-card'; empty.textContent = 'No goals yet. Add a goal to track progress automatically.'; root.append(empty); return; }
  store.data.goals.forEach(goal => {
    const metrics = goalMetrics(store.data, goal); const card = document.createElement('section'); card.className = 'surface-card plan-card';
    const head = document.createElement('div'); head.className = 'plan-card-head'; const title = document.createElement('div'); const h3 = document.createElement('h3'); h3.textContent = goal.name; const source = document.createElement('div'); source.className = 'subtle'; source.textContent = goal.source === 'cash' ? 'Total cash' : goal.source === 'account' ? accountName(goal.accountId) : 'Manual'; title.append(h3, source); const edit = document.createElement('button'); edit.className = 'icon-button'; edit.textContent = 'Edit'; edit.onclick = () => openGoalDialog(goal); head.append(title, edit);
    const track = document.createElement('div'); track.className = 'progress-track'; const fill = document.createElement('div'); fill.className = 'progress-fill'; fill.style.width = `${Math.round(metrics.progress * 100)}%`; track.append(fill);
    card.append(head, track, metricRow('Progress', `${Math.round(metrics.progress * 100)}%`), metricRow('Current', money(metrics.current)), metricRow('Target', money(metrics.target)), metricRow('Remaining', money(metrics.remaining)));
    if (metrics.monthlyRequired !== null) card.append(metricRow('Monthly needed', money(metrics.monthlyRequired)));
    const del = document.createElement('button'); del.className = 'text-button danger-text'; del.textContent = 'Delete goal'; del.onclick = () => { if (confirm(`Delete “${goal.name}”?`)) mutations.removeGoal(goal.id); }; card.append(del); root.append(card);
  });
}
function metricRow(label, value) { const row = document.createElement('div'); row.className = 'plan-metric'; const a = document.createElement('span'); a.textContent = label; const b = document.createElement('strong'); b.textContent = value; row.append(a, b); return row; }

function renderFunds() {
  const root = $('#fundsGrid'); clear(root);
  if (!store.data.funds.length) { const empty = document.createElement('div'); empty.className = 'empty-state surface-card'; empty.textContent = 'No sinking funds yet. Create one for a large future bill.'; root.append(empty); }
  store.data.funds.forEach(fund => {
    const metrics = fundMetrics(fund); const card = document.createElement('section'); card.className = 'surface-card plan-card fund-card'; const head = document.createElement('div'); head.className = 'plan-card-head'; const wrap = document.createElement('div'); const h3 = document.createElement('h3'); h3.textContent = fund.name; const due = document.createElement('div'); due.className = 'subtle'; due.textContent = fund.dueDate ? `Due ${fund.dueDate}` : 'No due date'; wrap.append(h3, due); const edit = document.createElement('button'); edit.className = 'icon-button'; edit.textContent = 'Edit'; edit.onclick = () => openFundDialog(fund); head.append(wrap, edit);
    const track = document.createElement('div'); track.className = 'progress-track'; const fill = document.createElement('div'); fill.className = 'progress-fill'; fill.style.width = `${Math.round(metrics.progress * 100)}%`; track.append(fill);
    card.append(head, track, metricRow('Reserved', money(metrics.reserved)), metricRow('Target', money(metrics.target)), metricRow('Remaining', money(metrics.remaining)));
    if (metrics.weeklyRequired !== null) card.append(metricRow('Per week', money(metrics.weeklyRequired)), metricRow('Per month', money(metrics.monthlyRequired)));
    const del = document.createElement('button'); del.className = 'text-button danger-text'; del.textContent = 'Delete fund'; del.onclick = () => { if (confirm(`Delete “${fund.name}”?`)) mutations.removeFund(fund.id); }; card.append(del); root.append(card);
  });

  const suggestions = $('#fundSuggestions'); clear(suggestions); const rows = suggestedFunds(store.data);
  if (!rows.length) { const empty = document.createElement('div'); empty.className = 'subtle'; empty.textContent = 'No unplanned large obligations detected in the next 24 months.'; suggestions.append(empty); }
  rows.forEach(item => {
    const row = document.createElement('div'); row.className = 'suggestion-row'; const copy = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = item.name; const meta = document.createElement('span'); meta.textContent = `${money(item.targetAmount)} · due ${item.dueDate}`; copy.append(strong, meta); const category = document.createElement('span'); category.textContent = categoryName(store.data, item.category); const button = document.createElement('button'); button.className = 'button small'; button.type = 'button'; button.textContent = 'Create fund'; button.onclick = () => openFundDialog({ name: item.name, targetAmount: item.targetAmount, reservedAmount: 0, dueDate: item.dueDate, linkedExpenseId: item.expenseId, accountId: '' }, true); row.append(copy, category, button); suggestions.append(row);
  });
}

function renderScenario() {
  const scenario = store.data.scenario; $('#scenarioEnabled').checked = Boolean(scenario.enabled); $('#scenarioName').value = scenario.name || ''; $('#scenarioIncome').value = Number(scenario.monthlyIncomeDelta || 0); $('#scenarioExpense').value = Number(scenario.monthlyExpenseDelta || 0); $('#scenarioOneTime').value = Number(scenario.oneTimeDelta || 0); $('#scenarioOneTimeDate').value = scenario.oneTimeDate || '';
  const to = addDays(new Date(), 365); const baseline = simulateBalance(store.data, to, new Date(), { includeScenario: false }); const withScenario = simulateBalance(store.data, to, new Date(), { includeScenario: true }); const delta = withScenario.endBalance - baseline.endBalance;
  $('#scenarioSummary').innerHTML = ''; const text = document.createTextNode('12-month impact: '); const strong = document.createElement('strong'); strong.textContent = `${delta >= 0 ? '+' : ''}${money(delta)}`; $('#scenarioSummary').append(text, strong);
}
function renderPlan() { renderGoals(); renderFunds(); renderScenario(); const totals = planTotals(store.data); void totals; }

function renderInsights() {
  const root = $('#insightsGrid'); clear(root); const insights = buildInsights(store.data);
  insights.forEach(insight => {
    const card = document.createElement('section'); card.className = 'surface-card insight-card'; const dot = document.createElement('div'); dot.className = `insight-tone ${insight.tone}`; const title = document.createElement('div'); title.className = 'insight-title'; title.textContent = insight.title; const value = document.createElement('div'); value.className = 'insight-value'; value.textContent = formatInsightValue(insight); const detail = document.createElement('div'); detail.className = 'insight-detail'; detail.textContent = insight.detail; card.append(dot, title, value, detail); root.append(card);
  });
  const events = itemsInRange(store.data, new Date(), addDays(new Date(), 365)); renderCategoryBars($('#categoryInsights'), events);
  const commitments = $('#commitmentSummary'); clear(commitments); const recurringExpenses = store.data.expenses.filter(item => item.frequency !== 'once').reduce((sum, item) => sum + annualized(item), 0); const recurringIncome = store.data.incomes.filter(item => item.frequency !== 'once').reduce((sum, item) => sum + annualized(item), 0);
  commitments.append(commitmentRow('Recurring income', recurringIncome, 'positive'), commitmentRow('Recurring expenses', recurringExpenses, 'negative'), commitmentRow('Recurring margin', recurringIncome - recurringExpenses, statusClass(recurringIncome - recurringExpenses)));
}
function commitmentRow(label, amount, tone) { const row = document.createElement('div'); row.className = 'commitment-row'; const span = document.createElement('span'); span.textContent = label; const strong = document.createElement('strong'); strong.className = tone; strong.textContent = money(amount); row.append(span, strong); return row; }

function renderTransactions(type) {
  const root = $(`#${type}List`); clear(root); const groups = ['once', 'weekly', 'biweekly', 'monthly', 'yearly'];
  groups.forEach(frequency => {
    const items = store.data[type].filter(item => item.frequency === frequency).sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description)); if (!items.length) return;
    const section = document.createElement('section'); section.className = 'transaction-group surface-card'; const header = document.createElement('div'); header.className = 'group-header'; const wrap = document.createElement('div'); const title = document.createElement('h3'); title.textContent = frequencyLabel(frequency); const meta = document.createElement('p'); meta.textContent = `${items.length} item${items.length === 1 ? '' : 's'} · ${money(items.reduce((sum, item) => sum + annualized(item), 0))}/yr`; wrap.append(title, meta); header.append(wrap); section.append(header);
    const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap'; const table = document.createElement('table'); table.innerHTML = '<thead><tr><th>Description</th><th>Category</th><th>Account</th><th>Amount</th><th>Start</th><th>End</th><th></th></tr></thead>'; const tbody = document.createElement('tbody');
    items.forEach(item => {
      const tr = document.createElement('tr'); const desc = document.createElement('td'); desc.textContent = item.description; const cat = document.createElement('td'); cat.textContent = categoryName(store.data, item.category); const account = document.createElement('td'); account.textContent = item.accountId ? accountName(item.accountId) : '—'; const amount = document.createElement('td'); amount.className = 'number'; amount.textContent = money(item.amount); const start = document.createElement('td'); start.textContent = item.date; const end = document.createElement('td'); end.textContent = item.endDate || '—'; const actions = document.createElement('td'); actions.className = 'row-actions'; const edit = document.createElement('button'); edit.className = 'icon-button'; edit.textContent = 'Edit'; edit.onclick = () => openTransactionDialog(type, item); const del = document.createElement('button'); del.className = 'icon-button danger-text'; del.textContent = 'Delete'; del.onclick = () => { if (confirm(`Delete “${item.description}”?`)) mutations.remove(type, item.id); }; actions.append(edit, del); tr.append(desc, cat, account, amount, start, end, actions); tbody.append(tr);
    }); table.append(tbody); tableWrap.append(table); section.append(tableWrap); root.append(section);
  });
  if (!root.childNodes.length) { const empty = document.createElement('div'); empty.className = 'empty-state surface-card'; empty.textContent = `No ${type === 'incomes' ? 'income' : 'expenses'} yet.`; root.append(empty); }
}

function renderSettings() {
  const accounts = $('#accountsList'); clear(accounts); store.data.accounts.forEach(account => {
    const row = document.createElement('div'); row.className = 'settings-row'; const copy = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = account.name; const meta = document.createElement('div'); meta.className = 'settings-row-meta'; meta.textContent = account.type; copy.append(strong, meta); const amount = document.createElement('strong'); amount.textContent = money(account.balance); const actions = document.createElement('div'); const edit = document.createElement('button'); edit.className = 'icon-button'; edit.textContent = 'Edit'; edit.onclick = () => openAccountDialog(account); actions.append(edit); if (store.data.accounts.length > 1) { const del = document.createElement('button'); del.className = 'icon-button danger-text'; del.textContent = 'Delete'; del.onclick = () => { if (confirm(`Delete account “${account.name}”? Transactions will become unassigned.`)) mutations.removeAccount(account.id); }; actions.append(del); } row.append(copy, amount, actions); accounts.append(row);
  });
  const cats = $('#categoriesList'); clear(cats); store.data.categories.forEach(category => { const chip = document.createElement('span'); chip.className = 'category-chip'; chip.append(document.createTextNode(category.name)); if (!defaultCategoryIds.has(category.id)) { const del = document.createElement('button'); del.type = 'button'; del.textContent = '×'; del.title = 'Delete category'; del.onclick = () => mutations.removeCategory(category.id); chip.append(del); } cats.append(chip); });
  setText('#trackingDate', store.data.settings.trackingStartDate || '—'); setText('#trackingBalance', money(store.data.settings.trackingStartBalance || 0)); $('#themeSelect').value = store.data.settings.theme || 'dark'; setText('#appVersion', APP_VERSION);
}

function renderAll() { setTheme(store.data.settings.theme || 'dark'); refreshSelects(); renderOverview(); renderCalendar(); renderPlan(); renderInsights(); renderTransactions('expenses'); renderTransactions('incomes'); renderSettings(); }
function switchView(view) { activeView = view; $$('.nav-item').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active', active); button.setAttribute('aria-current', active ? 'page' : 'false'); }); $$('.view').forEach(section => section.classList.toggle('active', section.id === `view-${view}`)); document.title = `${view === 'overview' ? 'Dashboard' : view.charAt(0).toUpperCase() + view.slice(1)} · Finance Planner`; if (view === 'overview') requestAnimationFrame(renderOverview); if (view === 'calendar') requestAnimationFrame(renderCalendar); }

function openTransactionDialog(type, item = null) {
  editingId = item?.id || null; editingType = type; $('#dialogTitle').textContent = `${item ? 'Edit' : 'Add'} ${type === 'incomes' ? 'income' : 'expense'}`; $('#fieldType').value = type; refreshSelects(); $('#fieldDescription').value = item?.description || ''; $('#fieldAmount').value = item?.amount ?? ''; $('#fieldDate').value = item?.date || todayISO(); $('#fieldEndDate').value = item?.endDate || ''; $('#fieldFrequency').value = item?.frequency || 'monthly'; $('#fieldCategory').value = item?.category || (type === 'incomes' ? 'income' : 'other'); $('#fieldAccount').value = item?.accountId || ''; $('#transactionDialog').showModal(); setTimeout(() => $('#fieldDescription').focus(), 0);
}
function saveTransaction(event) {
  event.preventDefault(); const amount = parseAmount($('#fieldAmount').value), description = $('#fieldDescription').value.trim(), date = $('#fieldDate').value, endDate = $('#fieldEndDate').value;
  if (!description || amount === null || amount < 0 || !parseISODate(date)) return toast('Enter a description, valid date, and non-negative amount.', 'danger'); if (endDate && (!parseISODate(endDate) || endDate < date)) return toast('End date must be on or after the start date.', 'danger');
  const nextType = $('#fieldType').value; const item = { id: editingId || uuid(), description, amount, date, endDate, frequency: $('#fieldFrequency').value, category: $('#fieldCategory').value, accountId: $('#fieldAccount').value };
  if (editingId) mutations.update(editingType, editingId, nextType, item); else mutations.add(nextType, item); $('#transactionDialog').close(); toast(editingId ? 'Transaction updated.' : 'Transaction added.', 'success');
}
function quickAdd(type) { const description = $('#quickDescription').value.trim(), amount = parseAmount($('#quickAmount').value), date = $('#quickDate').value || todayISO(); if (!description || amount === null || amount <= 0) return toast('Add a description and amount.', 'danger'); mutations.add(type, { description, amount, date, endDate: '', frequency: $('#quickFrequency').value, category: type === 'incomes' ? 'income' : ($('#quickCategory').value || suggestCategory(description, 'expense')), accountId: '' }); $('#quickDescription').value = ''; $('#quickAmount').value = ''; toast(type === 'incomes' ? 'Income added.' : 'Expense added.', 'success'); }

function openGoalDialog(goal = null) { editingGoalId = goal?.id || null; $('#goalDialogTitle').textContent = goal ? 'Edit goal' : 'Add goal'; $('#goalName').value = goal?.name || ''; $('#goalTarget').value = goal?.targetAmount ?? ''; $('#goalSource').value = goal?.source || 'cash'; $('#goalCurrent').value = goal?.currentAmount ?? 0; refreshSelects(); $('#goalAccount').value = goal?.accountId || ''; $('#goalDate').value = goal?.targetDate || ''; $('#goalDialog').showModal(); }
function saveGoal(event) { event.preventDefault(); const raw = { name: $('#goalName').value, targetAmount: $('#goalTarget').value, source: $('#goalSource').value, currentAmount: $('#goalCurrent').value, accountId: $('#goalAccount').value, targetDate: $('#goalDate').value }; if (editingGoalId) mutations.updateGoal(editingGoalId, raw); else mutations.addGoal(raw); $('#goalDialog').close(); toast('Goal saved.', 'success'); }
function openFundDialog(fund = null, suggestion = false) { editingFundId = suggestion ? null : (fund?.id || null); $('#fundDialogTitle').textContent = editingFundId ? 'Edit sinking fund' : 'Add sinking fund'; $('#fundName').value = fund?.name || ''; $('#fundTarget').value = fund?.targetAmount ?? ''; $('#fundReserved').value = fund?.reservedAmount ?? 0; $('#fundDate').value = fund?.dueDate || ''; refreshSelects(); $('#fundAccount').value = fund?.accountId || ''; $('#fundLinkedExpense').value = fund?.linkedExpenseId || ''; $('#fundDialog').showModal(); }
function saveFund(event) { event.preventDefault(); const raw = { name: $('#fundName').value, targetAmount: $('#fundTarget').value, reservedAmount: $('#fundReserved').value, dueDate: $('#fundDate').value, accountId: $('#fundAccount').value, linkedExpenseId: $('#fundLinkedExpense').value }; if (editingFundId) mutations.updateFund(editingFundId, raw); else mutations.addFund(raw); $('#fundDialog').close(); toast('Sinking fund saved.', 'success'); }
function openAccountDialog(account = null) { editingAccountId = account?.id || null; $('#accountDialogTitle').textContent = account ? 'Edit account' : 'Add account'; $('#accountName').value = account?.name || ''; $('#accountType').value = account?.type || 'checking'; $('#accountBalance').value = account?.balance ?? 0; $('#accountDialog').showModal(); }
function saveAccount(event) { event.preventDefault(); const raw = { name: $('#accountName').value, type: $('#accountType').value, balance: $('#accountBalance').value }; if (editingAccountId) mutations.updateAccount(editingAccountId, raw); else mutations.addAccount(raw); $('#accountDialog').close(); toast('Account saved.', 'success'); }
function saveCategory(event) { event.preventDefault(); const ok = mutations.addCategory({ name: $('#categoryName').value, kind: $('#categoryKind').value }); if (!ok) return toast('That category already exists.', 'danger'); $('#categoryDialog').close(); $('#categoryName').value = ''; toast('Category added.', 'success'); }

function openOccurrenceDialog(event) { reconcilingEvent = event; $('#occurrenceTitle').textContent = event.description; const existing = store.data.occurrenceOverrides?.[event.key]; $('#occurrenceStatus').value = existing?.status || (event.status === 'completed' || event.status === 'skipped' ? event.status : 'completed'); $('#occurrenceAmount').value = Math.abs(existing?.actualAmount ?? event.plannedAmount ?? event.amount); $('#occurrenceDate').value = existing?.actualDate || toISODateLocal(event.date); refreshSelects(); $('#occurrenceAccount').value = existing?.accountId || event.accountId || ''; $('#occurrenceDialog').showModal(); }
function saveOccurrence(event) { event.preventDefault(); if (!reconcilingEvent) return; const status = $('#occurrenceStatus').value; mutations.setOccurrence(reconcilingEvent.key, status === 'planned' ? null : { status, actualAmount: status === 'completed' ? parseAmount($('#occurrenceAmount').value) : null, actualDate: status === 'completed' ? $('#occurrenceDate').value : '', accountId: status === 'completed' ? $('#occurrenceAccount').value : '' }); $('#occurrenceDialog').close(); toast(status === 'planned' ? 'Occurrence reset to planned.' : `Occurrence marked ${status}.`, 'success'); }

function saveScenario() { mutations.saveScenario({ enabled: $('#scenarioEnabled').checked, name: $('#scenarioName').value, monthlyIncomeDelta: $('#scenarioIncome').value, monthlyExpenseDelta: $('#scenarioExpense').value, oneTimeDelta: $('#scenarioOneTime').value, oneTimeDate: $('#scenarioOneTimeDate').value }); toast('Scenario saved.', 'success'); }

function bindEvents() {
  $$('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view))); $$('[data-view-jump]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.viewJump))); $('#topBackup').addEventListener('click', () => switchView('settings'));
  $('#addExpense').addEventListener('click', () => openTransactionDialog('expenses')); $('#addIncome').addEventListener('click', () => openTransactionDialog('incomes')); $('#transactionForm').addEventListener('submit', saveTransaction); $('#dialogCancel').addEventListener('click', () => $('#transactionDialog').close()); $('#fieldType').addEventListener('change', refreshSelects); $('#fieldDescription').addEventListener('blur', () => { const kind = $('#fieldType').value === 'incomes' ? 'income' : 'expense'; const suggestion = suggestCategory($('#fieldDescription').value, kind); if ([...$('#fieldCategory').options].some(option => option.value === suggestion)) $('#fieldCategory').value = suggestion; });
  $$('.range-pill').forEach(button => button.addEventListener('click', () => { store.data.settings.targetMode = 'range'; store.data.settings.targetRangeDays = Number(button.dataset.days); store.data.settings.targetDate = ''; store.save(); })); $('#targetDate').addEventListener('change', event => { if (!parseISODate(event.target.value)) return; store.data.settings.targetMode = 'date'; store.data.settings.targetDate = event.target.value; store.save(); });
  $('#quickDate').value = todayISO(); $('#quickIncome').addEventListener('click', () => quickAdd('incomes')); $('#quickExpense').addEventListener('click', () => quickAdd('expenses')); $('#rangeSearch').addEventListener('input', debounce(renderUpcoming, 100));
  $('#calendarPrev').addEventListener('click', () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); selectedCalendarDate = toISODateLocal(calendarCursor); renderCalendar(); }); $('#calendarNext').addEventListener('click', () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); selectedCalendarDate = toISODateLocal(calendarCursor); renderCalendar(); }); $('#calendarToday').addEventListener('click', () => { const now = new Date(); calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1); selectedCalendarDate = todayISO(); renderCalendar(); });
  $('#addGoal').addEventListener('click', () => openGoalDialog()); $('#goalForm').addEventListener('submit', saveGoal); $('#goalCancel').addEventListener('click', () => $('#goalDialog').close()); $('#addFund').addEventListener('click', () => openFundDialog()); $('#fundForm').addEventListener('submit', saveFund); $('#fundCancel').addEventListener('click', () => $('#fundDialog').close()); $('#saveScenario').addEventListener('click', saveScenario);
  $('#addAccount').addEventListener('click', () => openAccountDialog()); $('#accountForm').addEventListener('submit', saveAccount); $('#accountCancel').addEventListener('click', () => $('#accountDialog').close()); $('#addCategory').addEventListener('click', () => $('#categoryDialog').showModal()); $('#categoryForm').addEventListener('submit', saveCategory); $('#categoryCancel').addEventListener('click', () => $('#categoryDialog').close());
  $('#occurrenceForm').addEventListener('submit', saveOccurrence); $('#occurrenceCancel').addEventListener('click', () => $('#occurrenceDialog').close());
  $('#resetTracking').addEventListener('click', () => { if (!confirm('Reset actual-vs-planned tracking baseline to today and the current cash balance?')) return; store.data.settings.trackingStartDate = todayISO(); store.data.settings.trackingStartBalance = combinedBalance(store.data); store.data.occurrenceOverrides = {}; store.save(); toast('Tracking baseline reset.', 'success'); });
  $('#themeSelect').addEventListener('change', event => { store.data.settings.theme = event.target.value; store.save(); }); $('#exportData').addEventListener('click', () => downloadText(`finance-planner-${todayISO()}.json`, JSON.stringify(store.data, null, 2)));
  $('#importFile').addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; try { const data = JSON.parse(await file.text()); const diagnostics = store.import(data); toast(diagnostics.length ? `Imported with ${diagnostics.length} note${diagnostics.length === 1 ? '' : 's'}.` : 'Backup imported.', diagnostics.length ? 'warning' : 'success'); if (diagnostics.length) console.warn('Import diagnostics', diagnostics); } catch (error) { console.error(error); toast('That file is not a valid Finance Planner backup.', 'danger'); } finally { event.target.value = ''; } });
  $('#resetData').addEventListener('click', () => { if (!confirm('Reset all Finance Planner data on this browser? Export a backup first if you may need it later.')) return; localStorage.removeItem('planner_v2'); localStorage.removeItem('planner_v2_backup'); location.reload(); });
  window.addEventListener('resize', debounce(() => activeView === 'overview' && drawBalanceChart($('#balanceChart'), currentSeries, { height: 300, comparisonSeries: scenarioSeries }), 120));
}

store.subscribe(renderAll); bindEvents(); renderAll(); switchView('overview'); setText('#brandVersion', `v${APP_VERSION}`); window.FinancePlanner = { version: APP_VERSION, ranges: RANGE_OPTIONS };
