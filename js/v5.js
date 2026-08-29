import { store } from './store.js';
import { drawBalanceChart } from './charts.js';
import { simulateBalance } from './forecast.js';
import {
  adaptiveForecast,
  balanceHistory,
  balanceTrend,
  ensureInitialSnapshot,
  ensureIntelligenceState,
  financialHealth,
  forecastLearning,
  futureObligations,
  goalOutlook,
  purchaseImpact,
  recordBalanceSnapshot,
  recurringOptimizations,
  safeToSpend
} from './intelligence.js';
import { addDays, money, parseAmount, todayISO, toISODateLocal } from './utils.js';

let savingIntelligence = false;
let selectedOptimizationId = '';

function $(selector) { return document.querySelector(selector); }
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}
function moneySigned(value) { return `${Number(value) >= 0 ? '+' : ''}${money(value)}`; }
function percent(value) { return `${Math.round(Number(value || 0) * 100)}%`; }
function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }

function intelligenceNeedsSave() {
  const state = ensureIntelligenceState(store.data);
  const lastBalanceUpdate = store.data.settings?.lastBalanceUpdate || '';
  if (!state.history.length) {
    ensureInitialSnapshot(store.data);
    return true;
  }
  if (lastBalanceUpdate && !state.history.some(row => row.sourceTimestamp === lastBalanceUpdate)) {
    recordBalanceSnapshot(store.data, lastBalanceUpdate);
    return true;
  }
  return false;
}

function syncIntelligenceState() {
  if (savingIntelligence) return;
  if (!intelligenceNeedsSave()) return;
  savingIntelligence = true;
  store.save();
  savingIntelligence = false;
}

function injectDashboard() {
  if ($('#v5IntelligenceStrip')) return;
  const kpis = document.querySelector('#view-overview .kpi-grid');
  if (!kpis) return;

  const strip = el('section', 'v5-intelligence-strip', '');
  strip.id = 'v5IntelligenceStrip';
  strip.innerHTML = `
    <article class="surface-card v5-intel-card v5-primary-card">
      <div class="v5-label">Safe to spend</div>
      <div class="v5-big-value" id="v5SafeSpend">$0.00</div>
      <div class="v5-detail" id="v5SafeDetail"></div>
    </article>
    <article class="surface-card v5-intel-card">
      <div class="v5-label">Major obligations · 12M</div>
      <div class="v5-value" id="v5Obligations">$0.00</div>
      <div class="v5-detail" id="v5ObligationCount"></div>
    </article>
    <article class="surface-card v5-intel-card">
      <div class="v5-label">Emergency reserve</div>
      <div class="v5-value" id="v5Emergency">$0.00</div>
      <div class="v5-detail" id="v5EmergencyDetail"></div>
    </article>
    <article class="surface-card v5-intel-card">
      <div class="v5-label">Forecast learning</div>
      <div class="v5-value" id="v5Accuracy">Learning</div>
      <div class="v5-detail" id="v5LearningDetail"></div>
    </article>`;
  kpis.after(strip);

  const firstDashboardGrid = document.querySelector('#view-overview .dashboard-grid');
  if (firstDashboardGrid) {
    const forecast = el('section', 'surface-card v5-adaptive-card');
    forecast.id = 'v5AdaptiveCard';
    forecast.innerHTML = `
      <div class="card-head">
        <div><div class="v5-badge">V5 intelligence</div><h2>Adaptive forecast</h2><p id="v5ForecastSubtitle">Learning from your balance check-ins.</p></div>
        <div class="v5-forecast-values"><strong id="v5AdaptiveEnd">$0.00</strong><span id="v5ForecastRange"></span></div>
      </div>
      <div class="v5-chart-legend"><span class="v5-legend adaptive">Adaptive</span><span class="v5-legend plan">Original plan</span><span class="v5-legend band">Confidence range</span></div>
      <canvas id="v5AdaptiveChart" class="v5-chart" aria-label="Adaptive forecast with confidence range"></canvas>
      <div class="v5-learning-row"><div><span>Learned spending buffer</span><strong id="v5LearnedBuffer">$0/mo</strong></div><div><span>Balance-history points</span><strong id="v5HistoryCount">0</strong></div><div><span>Observed monthly pace</span><strong id="v5MonthlyPace">$0/mo</strong></div></div>`;
    firstDashboardGrid.after(forecast);
  }

  const upcoming = $('#view-overview .table-card');
  if (upcoming) {
    const purchase = el('section', 'surface-card v5-purchase-card');
    purchase.id = 'v5PurchaseCard';
    purchase.innerHTML = `
      <div class="card-head"><div><div class="v5-badge">Decision tool</div><h2>Can I afford this?</h2><p>Test a purchase without saving it to your plan.</p></div></div>
      <form id="v5PurchaseForm" class="v5-purchase-form">
        <div class="field"><label for="v5PurchaseAmount">Purchase amount</label><input class="input" id="v5PurchaseAmount" type="number" min="0" step="0.01" placeholder="4500"></div>
        <div class="field"><label for="v5PurchaseDate">Purchase date</label><input class="input" id="v5PurchaseDate" type="date"></div>
        <button class="button primary" type="submit">Calculate impact</button>
      </form>
      <div class="v5-purchase-result hidden" id="v5PurchaseResult"></div>`;
    upcoming.before(purchase);
  }
}

function injectInsights() {
  if ($('#v5HealthSection')) return;
  const view = $('#view-insights');
  const head = view?.querySelector('.page-head');
  if (!view || !head) return;

  const health = el('section', 'v5-section');
  health.id = 'v5HealthSection';
  health.innerHTML = `
    <div class="section-head"><div><div class="v5-badge">V5 intelligence</div><h2>Financial health</h2><p>Operational signals with transparent calculations—no mystery score.</p></div></div>
    <div class="v5-health-grid" id="v5HealthGrid"></div>`;
  head.after(health);

  const history = el('section', 'v5-insights-grid');
  history.id = 'v5HistorySection';
  history.innerHTML = `
    <article class="surface-card v5-history-card">
      <div class="card-head"><div><h2>Actual cash trend</h2><p>Each Update balances check-in becomes a historical data point automatically.</p></div><div class="v5-history-stat"><strong id="v5TrendChange">$0</strong><span id="v5TrendPeriod">Since tracking began</span></div></div>
      <canvas id="v5HistoryChart" class="v5-chart compact" aria-label="Balance history"></canvas>
      <div class="v5-learning-row"><div><span>Monthly pace</span><strong id="v5TrendPace">$0/mo</strong></div><div><span>Forecast accuracy</span><strong id="v5HistoryAccuracy">Learning</strong></div><div><span>Unmodeled spending</span><strong id="v5HistoryBuffer">Learning</strong></div></div>
    </article>
    <article class="surface-card v5-obligation-card">
      <div class="card-head"><div><h2>Upcoming major obligations</h2><p>Large annual and one-time expenses inside the next 12 months.</p></div></div>
      <div id="v5ObligationList" class="v5-list"></div>
    </article>`;
  health.after(history);

  const goalOutlookSection = el('section', 'surface-card v5-wide-card');
  goalOutlookSection.id = 'v5GoalOutlookSection';
  goalOutlookSection.innerHTML = `<div class="card-head"><div><h2>Goal outlook</h2><p>Estimated completion dates use the pace observed in your balance history.</p></div></div><div id="v5GoalOutlook" class="v5-list"></div>`;
  history.after(goalOutlookSection);

  const optimize = el('section', 'surface-card v5-wide-card');
  optimize.id = 'v5OptimizationSection';
  optimize.innerHTML = `
    <div class="card-head"><div><h2>Recurring expense optimizer</h2><p>See the exact five-year forecast impact of removing a recurring expense without deleting anything.</p></div></div>
    <div id="v5OptimizationList" class="v5-optimization-list"></div>
    <div class="v5-optimization-compare hidden" id="v5OptimizationCompare">
      <div class="v5-compare-head"><strong id="v5OptimizationTitle"></strong><span id="v5OptimizationImpact"></span></div>
      <div class="v5-chart-legend"><span class="v5-legend plan">Current plan</span><span class="v5-legend scenario">Without expense</span></div>
      <canvas id="v5OptimizationChart" class="v5-chart compact"></canvas>
    </div>`;
  goalOutlookSection.after(optimize);
}

function injectSettings() {
  if ($('#v5SettingsCard')) return;
  const grid = $('#view-settings .settings-grid');
  if (!grid) return;
  const card = el('section', 'surface-card settings-card wide-card');
  card.id = 'v5SettingsCard';
  card.innerHTML = `
    <div class="settings-title"><div><div class="v5-badge">V5 intelligence</div><h2>Forecast intelligence</h2><p>These settings affect reserves and learned forecasts. No transaction tracking is required.</p></div></div>
    <div class="v5-settings-row">
      <label class="switch-row"><input id="v5AdaptiveToggle" type="checkbox"> Use learned spending behavior in adaptive forecasts</label>
      <div class="field"><label for="v5EmergencyMonths">Emergency reserve</label><select class="input" id="v5EmergencyMonths"><option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="9">9 months</option><option value="12">12 months</option></select></div>
      <div class="field"><label for="v5MajorThreshold">Major obligation threshold</label><input class="input" id="v5MajorThreshold" type="number" min="100" step="100"></div>
    </div>
    <div class="settings-actions"><button class="button danger" id="v5ClearHistory" type="button">Clear learning history</button></div>`;
  grid.prepend(card);
}

function inject() {
  injectDashboard();
  injectInsights();
  injectSettings();
  setText('#brandVersion', 'v5.0.0');
  setText('#appVersion', '5.0.0');
  const topTitle = $('.topbar-title');
  if (topTitle) topTitle.textContent = 'Financial Intelligence Center';
}

function healthValue(item) {
  if (item.kind === 'currency') return money(item.value);
  if (item.kind === 'percent') return percent(item.value);
  return String(item.value ?? '');
}

function renderHealth() {
  const root = $('#v5HealthGrid');
  if (!root) return;
  root.replaceChildren();
  financialHealth(store.data).forEach(item => {
    const card = el('article', `surface-card v5-health-card status-${item.status}`);
    card.innerHTML = `<div class="v5-health-label">${item.label}</div><div class="v5-health-value">${healthValue(item)}</div><div class="v5-health-status">${item.status}</div><p>${item.detail}</p>`;
    root.append(card);
  });
}

function renderObligations() {
  const rows = futureObligations(store.data, 365);
  const root = $('#v5ObligationList');
  if (!root) return;
  root.replaceChildren();
  if (!rows.length) {
    root.append(el('div', 'v5-empty', 'No major one-time or annual obligations detected in the next 12 months.'));
    return;
  }
  rows.slice(0, 8).forEach(item => {
    const row = el('div', 'v5-list-row');
    row.innerHTML = `<div><strong>${item.description}</strong><span>${item.date} · ${item.frequency}</span></div><strong>${money(item.amount)}</strong>`;
    root.append(row);
  });
}

function renderGoalOutlook() {
  const root = $('#v5GoalOutlook');
  if (!root) return;
  root.replaceChildren();
  const goals = store.data.goals || [];
  if (!goals.length) {
    root.append(el('div', 'v5-empty', 'Add a goal in Plan to see an estimated completion date here.'));
    return;
  }
  goals.forEach(goal => {
    const outlook = goalOutlook(store.data, goal);
    const eta = outlook.remaining === 0 ? 'Reached' : outlook.projectedDate || 'Learning your pace';
    const row = el('div', 'v5-list-row');
    row.innerHTML = `<div><strong>${goal.name}</strong><span>${money(outlook.remaining)} remaining · ${outlook.pace > 0 ? `${money(outlook.pace)}/mo pace` : 'needs more balance history'}</span></div><strong>${eta}</strong>`;
    root.append(row);
  });
}

function renderOptimizations() {
  const root = $('#v5OptimizationList');
  if (!root) return;
  root.replaceChildren();
  const rows = recurringOptimizations(store.data).slice(0, 10);
  if (!rows.length) {
    root.append(el('div', 'v5-empty', 'No recurring expenses to analyze.'));
    return;
  }
  rows.forEach(item => {
    const row = el('div', 'v5-optimization-row');
    const copy = el('div');
    copy.innerHTML = `<strong>${item.description}</strong><span>${money(item.annualCost)}/year · ${money(item.horizonBenefit)} five-year forecast impact</span>`;
    const button = el('button', 'button small', selectedOptimizationId === item.id ? 'Comparing' : 'Compare');
    button.type = 'button';
    button.onclick = () => { selectedOptimizationId = item.id; renderOptimizations(); renderOptimizationComparison(); };
    row.append(copy, button); root.append(row);
  });
  renderOptimizationComparison();
}

function renderOptimizationComparison() {
  const wrapper = $('#v5OptimizationCompare');
  if (!wrapper) return;
  const item = (store.data.expenses || []).find(expense => expense.id === selectedOptimizationId);
  if (!item) { wrapper.classList.add('hidden'); return; }
  wrapper.classList.remove('hidden');
  const from = new Date();
  const to = addDays(from, 1826);
  const baseline = simulateBalance(store.data, to, from, { includeOverrides: false, includeScenario: false });
  const clone = { ...store.data, expenses: store.data.expenses.filter(expense => expense.id !== item.id) };
  const without = simulateBalance(clone, to, from, { includeOverrides: false, includeScenario: false });
  setText('#v5OptimizationTitle', `Without ${item.description}`);
  setText('#v5OptimizationImpact', `${moneySigned(without.endBalance - baseline.endBalance)} after 5 years`);
  drawBalanceChart($('#v5OptimizationChart'), baseline.series, { height: 250, comparisonSeries: without.series });
}

function drawAdaptiveChart(canvas, forecast) {
  if (!canvas || !forecast?.series?.length) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, canvas.clientWidth || 320);
  const height = Math.max(250, canvas.clientHeight || 300);
  canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const styles = getComputedStyle(document.documentElement);
  const brand = styles.getPropertyValue('--brand').trim() || '#0052ff';
  const muted = styles.getPropertyValue('--muted').trim() || '#7c828a';
  const grid = styles.getPropertyValue('--hairline').trim() || '#dee1e6';
  const surface = styles.getPropertyValue('--surface').trim() || '#fff';
  const scenario = styles.getPropertyValue('--scenario').trim() || '#8b5cf6';
  const all = [...forecast.plan.series, ...forecast.series, ...forecast.upperSeries, ...forecast.lowerSeries];
  const xs = all.map(point => point.x.getTime()), ys = all.map(point => Number(point.y || 0));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minRaw = Math.min(...ys), maxRaw = Math.max(...ys);
  const yPad = Math.max((maxRaw - minRaw) * .12, 100); const minY = minRaw - yPad, maxY = maxRaw + yPad;
  const pad = { left: 70, right: 18, top: 20, bottom: 35 }; const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const xAt = point => pad.left + ((point.x.getTime() - minX) / (maxX - minX || 1)) * plotW;
  const yAt = point => pad.top + (1 - ((point.y - minY) / (maxY - minY || 1))) * plotH;
  ctx.fillStyle = surface; ctx.fillRect(0, 0, width, height);
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i += 1) {
    const value = minY + (maxY - minY) * i / 4; const y = pad.top + plotH - plotH * i / 4;
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillStyle = muted; ctx.fillText(money(value), 4, y);
  }
  if (forecast.adaptive && forecast.upperSeries.length) {
    ctx.beginPath();
    forecast.upperSeries.forEach((point, index) => index ? ctx.lineTo(xAt(point), yAt(point)) : ctx.moveTo(xAt(point), yAt(point)));
    [...forecast.lowerSeries].reverse().forEach(point => ctx.lineTo(xAt(point), yAt(point)));
    ctx.closePath(); ctx.fillStyle = 'rgba(0,82,255,.10)'; ctx.fill();
  }
  const draw = (series, color, dashed, widthValue) => {
    ctx.save(); if (dashed) ctx.setLineDash([7, 6]); ctx.beginPath();
    series.forEach((point, index) => index ? ctx.lineTo(xAt(point), yAt(point)) : ctx.moveTo(xAt(point), yAt(point)));
    ctx.strokeStyle = color; ctx.lineWidth = widthValue; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  };
  draw(forecast.plan.series, muted, true, 1.6);
  draw(forecast.series, forecast.adaptive ? brand : scenario, false, 2.8);
  ctx.fillStyle = muted; ctx.textBaseline = 'alphabetic'; ctx.fillText(toISODateLocal(forecast.series[0].x), pad.left, height - 10);
  const last = toISODateLocal(forecast.series.at(-1).x); ctx.fillText(last, width - pad.right - ctx.measureText(last).width, height - 10);
}

function renderDashboardIntelligence() {
  const safe = safeToSpend(store.data);
  const learning = forecastLearning(store.data);
  const trend = balanceTrend(store.data);
  const horizon = addDays(new Date(), 365);
  const adaptive = adaptiveForecast(store.data, horizon, new Date());

  setText('#v5SafeSpend', money(safe.safeToSpend));
  setText('#v5SafeDetail', safe.reserveShortfall ? `${money(safe.reserveShortfall)} additional reserve needed` : `${money(safe.cash - safe.safeToSpend)} conservatively reserved`);
  setText('#v5Obligations', money(safe.obligationReserve));
  setText('#v5ObligationCount', `${safe.obligations.length} major obligation${safe.obligations.length === 1 ? '' : 's'} inside 12 months`);
  setText('#v5Emergency', money(safe.emergencyReserve));
  setText('#v5EmergencyDetail', `${safe.emergencyMonths} months × ${money(safe.monthlyRecurring)}/mo recurring costs`);
  setText('#v5Accuracy', learning.accuracy == null ? 'Learning' : percent(learning.accuracy));
  setText('#v5LearningDetail', learning.intervalCount ? `${learning.intervalCount} observed interval${learning.intervalCount === 1 ? '' : 's'} · ${learning.status} estimate` : 'Update balances again on a later day to begin measuring accuracy');

  setText('#v5AdaptiveEnd', money(adaptive.endBalance));
  setText('#v5ForecastRange', adaptive.adaptive ? `${money(adaptive.lowerEnd)} – ${money(adaptive.upperEnd)} confidence range` : 'Plan forecast until enough history is available');
  setText('#v5ForecastSubtitle', adaptive.adaptive ? 'Adjusted automatically using the gap between planned cash flow and your actual balance history.' : 'Learning from your balance check-ins; no manual transaction actuals are needed.');
  setText('#v5LearnedBuffer', adaptive.adaptive ? `${money(learning.monthlyUnmodeledSpend)}/mo` : 'Learning');
  setText('#v5HistoryCount', String(learning.historyCount));
  setText('#v5MonthlyPace', trend.days ? `${moneySigned(trend.monthlyPace)}/mo` : 'Learning');
  drawAdaptiveChart($('#v5AdaptiveChart'), adaptive);
}

function renderHistory() {
  const history = balanceHistory(store.data);
  const trend = balanceTrend(store.data);
  const learning = forecastLearning(store.data);
  const series = history.map(row => ({ x: new Date(`${row.date}T12:00:00`), y: row.total }));
  if (series.length) drawBalanceChart($('#v5HistoryChart'), series, { height: 250 });
  setText('#v5TrendChange', history.length > 1 ? moneySigned(trend.change) : money(history.at(-1)?.total || 0));
  setText('#v5TrendPeriod', history.length > 1 ? `${trend.days} days of balance history` : 'First balance-history point');
  setText('#v5TrendPace', trend.days ? `${moneySigned(trend.monthlyPace)}/mo` : 'Learning');
  setText('#v5HistoryAccuracy', learning.accuracy == null ? 'Learning' : percent(learning.accuracy));
  setText('#v5HistoryBuffer', learning.intervalCount ? `${money(learning.monthlyUnmodeledSpend)}/mo` : 'Learning');
}

function renderSettings() {
  const state = ensureIntelligenceState(store.data);
  const toggle = $('#v5AdaptiveToggle'); if (toggle) toggle.checked = state.adaptiveForecast;
  const months = $('#v5EmergencyMonths'); if (months) months.value = String(state.emergencyMonths);
  const threshold = $('#v5MajorThreshold'); if (threshold) threshold.value = String(state.majorExpenseThreshold);
}

function renderAll() {
  inject();
  renderDashboardIntelligence();
  renderHealth();
  renderHistory();
  renderObligations();
  renderGoalOutlook();
  renderOptimizations();
  renderSettings();
}

function renderPurchaseResult(event) {
  event.preventDefault();
  const amount = parseAmount($('#v5PurchaseAmount')?.value);
  if (amount == null || amount <= 0) return;
  const date = $('#v5PurchaseDate')?.value || todayISO();
  const result = purchaseImpact(store.data, amount, date);
  const root = $('#v5PurchaseResult');
  if (!root) return;
  root.classList.remove('hidden');
  root.dataset.risk = result.risk;
  root.innerHTML = `
    <div class="v5-risk"><span>Impact</span><strong>${result.risk.toUpperCase()} RISK</strong></div>
    <div><span>Safe-to-spend after purchase</span><strong>${money(result.safeAfter)}</strong></div>
    <div><span>12-month ending cash</span><strong>${money(result.endBalance)}</strong></div>
    <div><span>Lowest projected cash</span><strong>${money(result.minBalance)}</strong></div>`;
}

function bind() {
  const purchaseForm = $('#v5PurchaseForm'); if (purchaseForm && !purchaseForm.dataset.bound) { purchaseForm.dataset.bound = '1'; purchaseForm.addEventListener('submit', renderPurchaseResult); }
  const purchaseDate = $('#v5PurchaseDate'); if (purchaseDate && !purchaseDate.value) purchaseDate.value = todayISO();

  const adaptive = $('#v5AdaptiveToggle'); if (adaptive && !adaptive.dataset.bound) {
    adaptive.dataset.bound = '1';
    adaptive.addEventListener('change', () => { ensureIntelligenceState(store.data).adaptiveForecast = adaptive.checked; store.save(); });
  }
  const months = $('#v5EmergencyMonths'); if (months && !months.dataset.bound) {
    months.dataset.bound = '1';
    months.addEventListener('change', () => { ensureIntelligenceState(store.data).emergencyMonths = Number(months.value || 3); store.save(); });
  }
  const threshold = $('#v5MajorThreshold'); if (threshold && !threshold.dataset.bound) {
    threshold.dataset.bound = '1';
    threshold.addEventListener('change', () => { ensureIntelligenceState(store.data).majorExpenseThreshold = Math.max(100, Number(threshold.value || 1000)); store.save(); });
  }
  const clear = $('#v5ClearHistory'); if (clear && !clear.dataset.bound) {
    clear.dataset.bound = '1';
    clear.addEventListener('click', () => {
      if (!confirm('Clear Finance Planner’s learned balance history? Your current accounts and plan will not be changed.')) return;
      const state = ensureIntelligenceState(store.data); state.history = []; store.data.settings.lastBalanceUpdate = new Date().toISOString();
      ensureInitialSnapshot(store.data); store.save();
    });
  }
}

function boot() {
  inject();
  syncIntelligenceState();
  renderAll();
  bind();
  store.subscribe(() => {
    syncIntelligenceState();
    renderAll();
    bind();
  });
  window.addEventListener('resize', () => {
    window.clearTimeout(boot.resizeTimer);
    boot.resizeTimer = window.setTimeout(() => {
      renderDashboardIntelligence(); renderHistory(); renderOptimizationComparison();
    }, 120);
  });
}

boot();
