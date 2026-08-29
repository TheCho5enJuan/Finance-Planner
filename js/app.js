import { APP_VERSION, RANGE_OPTIONS } from './constants.js';
import { store, mutations } from './store.js';
import { annualized, combinedBalance, next12Months, simulateBalance } from './forecast.js';
import { drawBalanceChart } from './charts.js';
import { $, $$, addDays, debounce, downloadText, money, parseAmount, parseISODate, startOfDay, todayISO, toISODateLocal, uuid } from './utils.js';

let activeView = 'overview';
let editingId = null;
let editingType = 'expenses';
let currentSeries = [];
let currentEvents = [];

function targetDate() {
  const settings = store.data.settings;
  if (settings.targetMode === 'date' && parseISODate(settings.targetDate)) return parseISODate(settings.targetDate);
  return addDays(new Date(), Number(settings.targetRangeDays || 180));
}

function setText(selector, text) {
  const el = $(selector);
  if (el) el.textContent = text;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
}

function statusClass(value) {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function renderOverview() {
  const from = startOfDay(new Date());
  const to = targetDate();
  const forecast = simulateBalance(store.data, to, from);
  const twelve = next12Months(store.data, from);
  currentSeries = forecast.series;
  currentEvents = forecast.events;

  setText('#heroBalance', money(combinedBalance(store.data)));
  setText('#forecastBalance', money(forecast.endBalance));
  setText('#forecastDateLabel', `Projected ${toISODateLocal(to)}`);
  setText('#income12', money(twelve.income));
  setText('#expense12', money(twelve.expense));
  setText('#net12', money(twelve.net));
  setText('#daysNegative', forecast.daysToNegative === null ? 'Not projected' : forecast.daysToNegative === 0 ? 'Today' : `${forecast.daysToNegative} days`);

  $('#forecastBalance')?.classList.remove('positive', 'negative', 'neutral');
  $('#forecastBalance')?.classList.add(statusClass(forecast.endBalance));
  $('#net12')?.classList.remove('positive', 'negative', 'neutral');
  $('#net12')?.classList.add(statusClass(twelve.net));

  const mode = store.data.settings.targetMode || 'range';
  $$('.range-pill').forEach(button => {
    const selected = mode === 'range' && Number(button.dataset.days) === Number(store.data.settings.targetRangeDays);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  const targetInput = $('#targetDate');
  if (targetInput) targetInput.value = toISODateLocal(to);

  drawBalanceChart($('#balanceChart'), currentSeries, { height: 300 });
  renderUpcoming();
}

function renderUpcoming() {
  const tbody = $('#upcomingBody');
  if (!tbody) return;
  tbody.replaceChildren();
  const term = ($('#rangeSearch')?.value || '').trim().toLowerCase();
  let balance = combinedBalance(store.data);
  const rows = currentEvents.map(event => {
    balance += event.amount;
    return { ...event, balance };
  }).filter(row => !term || row.description.toLowerCase().includes(term));

  const fragment = document.createDocumentFragment();
  rows.slice(0, 250).forEach(row => {
    const tr = document.createElement('tr');
    const type = document.createElement('span');
    type.className = `transaction-dot ${row.amount >= 0 ? 'income' : 'expense'}`;
    const desc = document.createElement('td');
    desc.append(type, document.createTextNode(row.description));
    const date = document.createElement('td'); date.textContent = toISODateLocal(row.date);
    const freq = document.createElement('td'); freq.textContent = row.frequency === 'biweekly' ? 'Bi-weekly' : row.frequency;
    const amount = document.createElement('td'); amount.textContent = money(row.amount); amount.className = `number ${statusClass(row.amount)}`;
    const bal = document.createElement('td'); bal.textContent = money(row.balance); bal.className = `number ${statusClass(row.balance)}`;
    tr.append(desc, date, freq, amount, bal);
    fragment.append(tr);
  });
  tbody.append(fragment);
  setText('#upcomingCount', `${rows.length} occurrence${rows.length === 1 ? '' : 's'}`);
}

function frequencyLabel(value) {
  return value === 'biweekly' ? 'Bi-weekly' : value.charAt(0).toUpperCase() + value.slice(1);
}

function renderTransactions(type) {
  const root = $(`#${type}List`);
  if (!root) return;
  root.replaceChildren();
  const groups = ['once', 'weekly', 'biweekly', 'monthly', 'yearly'];
  const fragment = document.createDocumentFragment();

  groups.forEach(frequency => {
    const items = store.data[type].filter(item => item.frequency === frequency).sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
    if (!items.length) return;
    const section = document.createElement('section');
    section.className = 'transaction-group surface-card';
    const header = document.createElement('div');
    header.className = 'group-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = frequencyLabel(frequency);
    const meta = document.createElement('p');
    const annual = items.reduce((sum, item) => sum + annualized(item), 0);
    meta.textContent = `${items.length} item${items.length === 1 ? '' : 's'} · ${money(annual)}/yr`;
    titleWrap.append(title, meta);
    header.append(titleWrap);
    section.append(header);

    const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Description</th><th>Amount</th><th>Start</th><th>End</th><th class="action-col">Actions</th></tr></thead>';
    const tbody = document.createElement('tbody');
    items.forEach(item => {
      const tr = document.createElement('tr');
      const desc = document.createElement('td'); desc.textContent = item.description;
      const amt = document.createElement('td'); amt.textContent = money(item.amount); amt.className = 'number';
      const start = document.createElement('td'); start.textContent = item.date;
      const end = document.createElement('td'); end.textContent = item.endDate || '—';
      const actions = document.createElement('td'); actions.className = 'row-actions';
      const edit = document.createElement('button'); edit.className = 'icon-button'; edit.type = 'button'; edit.textContent = 'Edit'; edit.onclick = () => openTransactionDialog(type, item);
      const remove = document.createElement('button'); remove.className = 'icon-button danger-text'; remove.type = 'button'; remove.textContent = 'Delete'; remove.onclick = () => {
        if (confirm(`Delete “${item.description}”?`)) mutations.remove(type, item.id);
      };
      actions.append(edit, remove);
      tr.append(desc, amt, start, end, actions);
      tbody.append(tr);
    });
    table.append(tbody); tableWrap.append(table); section.append(tableWrap); fragment.append(section);
  });

  if (!fragment.childNodes.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state surface-card';
    empty.innerHTML = `<strong>No ${type === 'incomes' ? 'income' : 'expenses'} yet</strong><span>Add your first recurring or one-time item to start forecasting.</span>`;
    fragment.append(empty);
  }
  root.append(fragment);
}

function renderSettings() {
  $('#checkingBalance').value = Number(store.data.balances?.checking || 0);
  $('#savingsBalance').value = Number(store.data.balances?.savings || 0);
  $('#themeSelect').value = store.data.settings?.theme || 'dark';
  setText('#combinedBalance', money(combinedBalance(store.data)));
  setText('#appVersion', APP_VERSION);
}

function renderAll() {
  setTheme(store.data.settings?.theme || 'dark');
  renderOverview();
  renderTransactions('expenses');
  renderTransactions('incomes');
  renderSettings();
}

function switchView(view) {
  activeView = view;
  $$('.nav-item').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  $$('.view').forEach(section => section.classList.toggle('active', section.id === `view-${view}`));
  document.title = `${view.charAt(0).toUpperCase() + view.slice(1)} · Finance Planner`;
  if (view === 'overview') requestAnimationFrame(renderOverview);
}

function toast(message, tone = 'neutral') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

function openTransactionDialog(type, item = null) {
  editingId = item?.id || null;
  editingType = type;
  $('#dialogTitle').textContent = `${item ? 'Edit' : 'Add'} ${type === 'incomes' ? 'income' : 'expense'}`;
  $('#fieldType').value = type === 'incomes' ? 'incomes' : 'expenses';
  $('#fieldDescription').value = item?.description || '';
  $('#fieldAmount').value = item?.amount ?? '';
  $('#fieldDate').value = item?.date || todayISO();
  $('#fieldEndDate').value = item?.endDate || '';
  $('#fieldFrequency').value = item?.frequency || 'monthly';
  $('#transactionDialog').showModal();
  setTimeout(() => $('#fieldDescription').focus(), 0);
}

function saveTransaction(event) {
  event.preventDefault();
  const amount = parseAmount($('#fieldAmount').value);
  const description = $('#fieldDescription').value.trim();
  const date = $('#fieldDate').value;
  const endDate = $('#fieldEndDate').value;
  if (!description || amount === null || amount < 0 || !parseISODate(date)) {
    toast('Enter a description, valid date, and non-negative amount.', 'danger');
    return;
  }
  if (endDate && (!parseISODate(endDate) || endDate < date)) {
    toast('End date must be on or after the start date.', 'danger');
    return;
  }
  const nextType = $('#fieldType').value;
  const item = {
    id: editingId || uuid(),
    description,
    amount,
    date,
    endDate,
    frequency: $('#fieldFrequency').value,
    category: ''
  };
  if (editingId) mutations.update(editingType, editingId, nextType, item);
  else mutations.add(nextType, item);
  $('#transactionDialog').close();
  toast(editingId ? 'Transaction updated.' : 'Transaction added.', 'success');
}

function quickAdd(type) {
  const description = $('#quickDescription').value.trim();
  const amount = parseAmount($('#quickAmount').value);
  const date = $('#quickDate').value || todayISO();
  if (!description || amount === null || amount <= 0) return toast('Add a description and amount.', 'danger');
  mutations.add(type, {
    description,
    amount,
    date,
    endDate: '',
    frequency: $('#quickFrequency').value,
    category: ''
  });
  $('#quickDescription').value = '';
  $('#quickAmount').value = '';
  toast(type === 'incomes' ? 'Income added.' : 'Expense added.', 'success');
}

function bindEvents() {
  $$('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  $('#addExpense').addEventListener('click', () => openTransactionDialog('expenses'));
  $('#addIncome').addEventListener('click', () => openTransactionDialog('incomes'));
  $('#transactionForm').addEventListener('submit', saveTransaction);
  $('#dialogCancel').addEventListener('click', () => $('#transactionDialog').close());

  $$('.range-pill').forEach(button => button.addEventListener('click', () => {
    store.data.settings.targetMode = 'range';
    store.data.settings.targetRangeDays = Number(button.dataset.days);
    store.data.settings.targetDate = '';
    store.save();
  }));
  $('#targetDate').addEventListener('change', event => {
    if (!parseISODate(event.target.value)) return;
    store.data.settings.targetMode = 'date';
    store.data.settings.targetDate = event.target.value;
    store.save();
  });

  $('#quickDate').value = todayISO();
  $('#quickIncome').addEventListener('click', () => quickAdd('incomes'));
  $('#quickExpense').addEventListener('click', () => quickAdd('expenses'));
  $('#rangeSearch').addEventListener('input', debounce(renderUpcoming, 100));

  $('#saveBalances').addEventListener('click', () => {
    store.data.balances = {
      checking: parseAmount($('#checkingBalance').value) ?? 0,
      savings: parseAmount($('#savingsBalance').value) ?? 0
    };
    store.save();
    toast('Account balances saved.', 'success');
  });

  $('#themeSelect').addEventListener('change', event => {
    store.data.settings.theme = event.target.value;
    store.save();
  });

  $('#exportData').addEventListener('click', () => {
    downloadText(`finance-planner-${todayISO()}.json`, JSON.stringify(store.data, null, 2));
  });

  $('#importFile').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const diagnostics = store.import(data);
      toast(diagnostics.length ? `Imported with ${diagnostics.length} warning${diagnostics.length === 1 ? '' : 's'}.` : 'Backup imported.', diagnostics.length ? 'warning' : 'success');
      if (diagnostics.length) console.warn('Import diagnostics', diagnostics);
    } catch (error) {
      console.error(error);
      toast('That file is not a valid Finance Planner backup.', 'danger');
    } finally {
      event.target.value = '';
    }
  });

  $('#resetData').addEventListener('click', () => {
    if (!confirm('Reset all Finance Planner data on this browser? This cannot be undone unless you exported a backup.')) return;
    localStorage.removeItem('planner_v2');
    localStorage.removeItem('planner_v2_backup');
    location.reload();
  });

  window.addEventListener('resize', debounce(() => activeView === 'overview' && drawBalanceChart($('#balanceChart'), currentSeries, { height: 300 }), 120));
}

store.subscribe(renderAll);
bindEvents();
renderAll();
switchView('overview');
setText('#brandVersion', `v${APP_VERSION}`);

// Expose range metadata only for lightweight manual diagnostics.
window.FinancePlanner = { version: APP_VERSION, ranges: RANGE_OPTIONS };
