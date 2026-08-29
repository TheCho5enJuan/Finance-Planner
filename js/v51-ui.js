import { store } from './store.js';
import { adaptiveForecast, forecastLearning } from './intelligence.js';
import { itemsInRange } from './forecast.js';
import { categoryName } from './categories.js';
import { addDays, money, parseISODate, toISODateLocal } from './utils.js';

const DAY_MS = 86400000;
const RANGE_LABELS = new Map([[90, '3M'], [180, '6M'], [365, '12M'], [730, '24M'], [1826, '5Y']]);
let enhanceTimer = 0;
let selectedCategoryId = '';
let tooltip = null;

function $(selector) { return document.querySelector(selector); }
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}
function signedMoney(value) { return `${Number(value) >= 0 ? '+' : ''}${money(value)}`; }
function percent(value) { return `${Math.round(Number(value || 0) * 100)}%`; }
function visible(node) { return Boolean(node && node.getClientRects().length && node.clientWidth > 40); }

function ensureStyles() {
  if ($('#v51Styles')) return;
  const link = document.createElement('link');
  link.id = 'v51Styles';
  link.rel = 'stylesheet';
  link.href = './css/v51.css?v=5.1.0';
  document.head.append(link);
}

function activeHorizon() {
  const settings = store.data.settings || {};
  if (settings.targetMode === 'date' && parseISODate(settings.targetDate)) {
    const from = new Date();
    const to = parseISODate(settings.targetDate);
    const days = Math.max(1, Math.round((to - from) / DAY_MS));
    return { days, to, label: toISODateLocal(to) };
  }
  const days = Math.max(1, Number(settings.targetRangeDays || 365));
  return { days, to: addDays(new Date(), days), label: RANGE_LABELS.get(days) || `${days}D` };
}

function optimizeDashboardLayout() {
  const view = $('#view-overview');
  const hero = view?.querySelector('.hero-grid');
  const adaptive = $('#v5AdaptiveCard');
  const kpis = view?.querySelector('.kpi-grid');
  const intel = $('#v5IntelligenceStrip');
  const planGrid = $('#balanceChart')?.closest('.dashboard-grid');
  const radarCard = $('#radarMini')?.closest('.radar-card');
  const categoryCard = $('#categoryOverview')?.closest('.category-card');
  const quickCard = $('#quickDescription')?.closest('.quick-card');
  const purchaseCard = $('#v5PurchaseCard');
  const upcoming = view?.querySelector('.table-card');
  if (!view || !hero || !adaptive || !kpis || !intel) return;

  kpis.classList.add('v51-metric-strip');
  intel.classList.add('v51-intelligence-strip');
  planGrid?.classList.add('v51-hidden-plan-grid');

  let secondary = $('#v51DashboardSecondary');
  if (!secondary) {
    secondary = el('div', 'v51-dashboard-row');
    secondary.id = 'v51DashboardSecondary';
  }
  if (categoryCard && categoryCard.parentElement !== secondary) secondary.append(categoryCard);
  if (radarCard && radarCard.parentElement !== secondary) secondary.append(radarCard);

  let decisions = $('#v51DecisionRow');
  if (!decisions) {
    decisions = el('div', 'v51-dashboard-row v51-decision-row');
    decisions.id = 'v51DecisionRow';
  }
  if (purchaseCard && purchaseCard.parentElement !== decisions) decisions.append(purchaseCard);
  if (quickCard && quickCard.parentElement !== decisions) decisions.append(quickCard);

  view.querySelectorAll('.dashboard-grid.equal').forEach(grid => {
    if (!grid.querySelector('.surface-card')) grid.classList.add('v51-empty-grid');
  });

  hero.after(adaptive);
  adaptive.after(kpis);
  kpis.after(intel);
  intel.after(secondary);
  secondary.after(decisions);
  if (upcoming) decisions.after(upcoming);

  const title = adaptive.querySelector('h2');
  if (title && !title.querySelector('.v51-horizon-pill')) {
    const wrap = el('div', 'v51-adaptive-headline');
    const text = document.createTextNode('Adaptive forecast');
    const pill = el('span', 'v51-horizon-pill', '12M');
    wrap.append(text, pill);
    title.replaceChildren(wrap);
  }
  const legend = adaptive.querySelector('.v5-chart-legend');
  if (legend && !adaptive.querySelector('.v51-chart-hint')) {
    legend.after(el('div', 'v51-chart-hint', 'Hover with a mouse or press and drag on the chart to inspect values.'));
  }
}

function drawAdaptiveSelected(canvas, forecast) {
  if (!canvas || !forecast?.series?.length || !visible(canvas)) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = Math.max(250, canvas.clientHeight || 300);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.documentElement);
  const brand = styles.getPropertyValue('--brand').trim() || '#0052ff';
  const muted = styles.getPropertyValue('--muted').trim() || '#7c828a';
  const grid = styles.getPropertyValue('--hairline').trim() || '#dee1e6';
  const surface = styles.getPropertyValue('--surface').trim() || '#fff';
  const all = [...forecast.plan.series, ...forecast.series, ...forecast.upperSeries, ...forecast.lowerSeries];
  const xs = all.map(point => point.x.getTime());
  const ys = all.map(point => Number(point.y || 0));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minRaw = Math.min(...ys), maxRaw = Math.max(...ys);
  const yPad = Math.max((maxRaw - minRaw) * .12, 100);
  const minY = minRaw - yPad, maxY = maxRaw + yPad;
  const pad = { left: 70, right: 18, top: 20, bottom: 35 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const xAt = point => pad.left + ((point.x.getTime() - minX) / (maxX - minX || 1)) * plotW;
  const yAt = point => pad.top + (1 - ((point.y - minY) / (maxY - minY || 1))) * plotH;

  ctx.fillStyle = surface;
  ctx.fillRect(0, 0, width, height);
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i += 1) {
    const value = minY + (maxY - minY) * i / 4;
    const y = pad.top + plotH - plotH * i / 4;
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillStyle = muted; ctx.fillText(money(value), 4, y);
  }

  if (forecast.adaptive && forecast.upperSeries.length) {
    ctx.beginPath();
    forecast.upperSeries.forEach((point, index) => index ? ctx.lineTo(xAt(point), yAt(point)) : ctx.moveTo(xAt(point), yAt(point)));
    [...forecast.lowerSeries].reverse().forEach(point => ctx.lineTo(xAt(point), yAt(point)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,82,255,.10)';
    ctx.fill();
  }

  const draw = (series, color, dashed, lineWidth) => {
    ctx.save();
    if (dashed) ctx.setLineDash([7, 6]);
    ctx.beginPath();
    series.forEach((point, index) => index ? ctx.lineTo(xAt(point), yAt(point)) : ctx.moveTo(xAt(point), yAt(point)));
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();
  };
  draw(forecast.plan.series, muted, true, 1.6);
  draw(forecast.series, brand, false, 2.8);

  ctx.fillStyle = muted;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(toISODateLocal(forecast.series[0].x), pad.left, height - 10);
  const last = toISODateLocal(forecast.series.at(-1).x);
  ctx.fillText(last, width - pad.right - ctx.measureText(last).width, height - 10);

  canvas._v51ChartMeta = {
    minX, maxX, pad, plotW, width,
    primary: forecast.series,
    series: [
      { label: 'Adaptive', points: forecast.series },
      { label: 'Original plan', points: forecast.plan.series }
    ],
    confidence: forecast.adaptive ? { lower: forecast.lowerSeries, upper: forecast.upperSeries } : null
  };
}

function renderAdaptiveForSelectedRange() {
  const canvas = $('#v5AdaptiveChart');
  if (!canvas) return;
  const horizon = activeHorizon();
  const forecast = adaptiveForecast(store.data, horizon.to, new Date());
  const learning = forecastLearning(store.data);
  const end = $('#v5AdaptiveEnd');
  const range = $('#v5ForecastRange');
  const subtitle = $('#v5ForecastSubtitle');
  const pill = $('#v5AdaptiveCard .v51-horizon-pill');
  if (pill) pill.textContent = horizon.label;
  if (end) end.textContent = money(forecast.endBalance);
  if (range) range.textContent = forecast.adaptive
    ? `${money(forecast.lowerEnd)} – ${money(forecast.upperEnd)} confidence range`
    : 'Plan forecast until enough history is available';
  if (subtitle) subtitle.textContent = forecast.adaptive
    ? `${horizon.label} outlook adjusted using your balance-history gap versus the original plan.`
    : `${horizon.label} outlook; more balance history is needed before an adaptive adjustment is available.`;
  const buffer = $('#v5LearnedBuffer');
  if (buffer) buffer.textContent = forecast.adaptive ? `${money(learning.monthlyUnmodeledSpend)}/mo` : 'Learning';
  drawAdaptiveSelected(canvas, forecast);
}

function categorySummary(days = 365, from = new Date()) {
  const to = addDays(from, days);
  const events = itemsInRange(store.data, from, to, { includeOverrides: false, includeScenario: false })
    .filter(event => event.type === 'expense');
  const byCategory = new Map();
  events.forEach(event => {
    const id = event.category || 'other';
    if (!byCategory.has(id)) byCategory.set(id, { id, amount: 0, recurring: 0, oneTime: 0, eventCount: 0, itemIds: new Set(), items: new Map() });
    const row = byCategory.get(id);
    const amount = Math.abs(Number(event.amount || 0));
    row.amount += amount;
    row.eventCount += 1;
    row.itemIds.add(event.id);
    if (event.frequency === 'once') row.oneTime += amount; else row.recurring += amount;
    if (!row.items.has(event.id)) row.items.set(event.id, { id: event.id, description: event.description, amount: 0, count: 0, frequency: event.frequency });
    const item = row.items.get(event.id);
    item.amount += amount;
    item.count += 1;
  });
  const total = [...byCategory.values()].reduce((sum, row) => sum + row.amount, 0);
  return [...byCategory.values()]
    .map(row => ({ ...row, share: total ? row.amount / total : 0, monthly: row.amount * 30.4375 / Math.max(days, 1), items: [...row.items.values()].sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.amount - a.amount);
}

function renderDashboardCategories() {
  const root = $('#categoryOverview');
  if (!root) return;
  const rows = categorySummary(365);
  root.replaceChildren();
  const card = root.closest('.category-card');
  const heading = card?.querySelector('h2');
  const copy = card?.querySelector('.card-head p');
  if (heading) heading.textContent = 'Where your money goes';
  if (copy) copy.textContent = 'Next 12 months · total, share, and monthly pace.';
  const max = rows[0]?.amount || 1;
  rows.slice(0, 6).forEach(row => {
    const wrapper = el('div', 'v51-category-row');
    const text = el('div', 'v51-category-copy');
    text.append(el('div', 'v51-category-name', categoryName(store.data, row.id)), el('div', 'v51-category-meta', `${percent(row.share)} · ${money(row.monthly)}/mo`));
    const track = el('div', 'v51-category-track');
    const fill = el('div', 'v51-category-fill');
    fill.style.width = `${Math.max(3, row.amount / max * 100)}%`;
    track.append(fill);
    wrapper.append(text, track, el('div', 'v51-category-value', money(row.amount)));
    root.append(wrapper);
  });
  if (rows.length) {
    const button = el('button', 'text-button', 'Explore category details →');
    button.type = 'button';
    button.onclick = () => document.querySelector('[data-view="insights"]')?.click();
    root.append(button);
  }
}

function ensureCategoryExplorer() {
  if ($('#v51CategoryExplorer')) return;
  const insights = $('#view-insights');
  const anchor = $('#v5HistorySection') || insights?.querySelector('.page-head');
  if (!insights || !anchor) return;
  const section = el('section', 'surface-card v5-wide-card v51-category-explorer');
  section.id = 'v51CategoryExplorer';
  const head = el('div', 'card-head');
  const copy = el('div');
  copy.append(el('h2', '', 'Category intelligence'), el('p', '', 'Understand what each category contributes to the next 12 months instead of treating categories as labels only.'));
  head.append(copy);
  const grid = el('div', 'v51-category-grid'); grid.id = 'v51CategoryGrid';
  const detail = el('div', 'v51-category-detail'); detail.id = 'v51CategoryDetail';
  section.append(head, grid, detail);
  anchor.after(section);
}

function renderCategoryExplorer() {
  ensureCategoryExplorer();
  const grid = $('#v51CategoryGrid');
  const detail = $('#v51CategoryDetail');
  if (!grid || !detail) return;
  const rows = categorySummary(365);
  if (!selectedCategoryId || !rows.some(row => row.id === selectedCategoryId)) selectedCategoryId = rows[0]?.id || '';
  grid.replaceChildren();
  rows.forEach(row => {
    const button = el('button', `v51-category-card${row.id === selectedCategoryId ? ' active' : ''}`);
    button.type = 'button';
    button.append(el('span', '', categoryName(store.data, row.id)), el('strong', '', money(row.amount)), el('small', '', `${percent(row.share)} of spending · ${money(row.monthly)}/mo`));
    button.onclick = () => { selectedCategoryId = row.id; renderCategoryExplorer(); };
    grid.append(button);
  });

  detail.replaceChildren();
  const row = rows.find(item => item.id === selectedCategoryId);
  if (!row) { detail.append(el('div', 'v5-empty', 'No projected category spending.')); return; }
  const detailHead = el('div', 'v51-category-detail-head');
  const left = el('div');
  left.append(el('h3', '', categoryName(store.data, row.id)), el('p', '', `${row.itemIds.size} planned item${row.itemIds.size === 1 ? '' : 's'} producing ${row.eventCount} occurrence${row.eventCount === 1 ? '' : 's'} in the next 12 months.`));
  detailHead.append(left, el('strong', '', money(row.amount)));
  const metrics = el('div', 'v51-category-metrics');
  const metric = (label, value) => { const cell = el('div'); cell.append(el('span', '', label), el('strong', '', value)); return cell; };
  metrics.append(metric('Monthly pace', money(row.monthly)), metric('Recurring', money(row.recurring)), metric('One-time', money(row.oneTime)));
  const items = el('div', 'v51-category-items');
  row.items.slice(0, 8).forEach(item => {
    const line = el('div', 'v51-category-item');
    const copy = el('div');
    copy.append(el('strong', '', item.description), el('span', '', `${item.frequency} · ${item.count} occurrence${item.count === 1 ? '' : 's'}`));
    line.append(copy, el('strong', '', money(item.amount)));
    items.append(line);
  });
  detail.append(detailHead, metrics, items);
}

function calendarMonth() {
  const title = $('#calendarTitle')?.textContent?.trim();
  if (!title) return null;
  const parsed = new Date(`${title} 1, 12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function renderCalendarEnhancements() {
  const view = $('#view-calendar');
  const card = view?.querySelector('.calendar-card');
  const dayDetail = view?.querySelector('.day-detail');
  const first = calendarMonth();
  if (!view || !card || !first) return;
  const end = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const events = itemsInRange(store.data, first, end, { includeOverrides: false, includeScenario: false });
  const incomes = events.filter(event => event.type === 'income');
  const expenses = events.filter(event => event.type === 'expense');
  const income = incomes.reduce((sum, event) => sum + Number(event.amount || 0), 0);
  const expense = expenses.reduce((sum, event) => sum + Math.abs(Number(event.amount || 0)), 0);
  const net = income - expense;

  let summary = $('#v51CalendarSummary');
  if (!summary) { summary = el('section', 'v51-calendar-summary'); summary.id = 'v51CalendarSummary'; card.before(summary); }
  summary.replaceChildren();
  const metric = (label, value, extra = '') => {
    const box = el('article', 'surface-card v51-calendar-metric');
    box.append(el('span', '', label), el('strong', extra, value)); return box;
  };
  summary.append(metric('Income', money(income), 'positive'), metric('Expenses', money(expense), 'negative'), metric('Net cash flow', signedMoney(net), net >= 0 ? 'positive' : 'negative'), metric('Scheduled items', String(events.length)));

  let breakdown = $('#v51CalendarBreakdown');
  if (!breakdown) { breakdown = el('section', 'surface-card v51-calendar-breakdown'); breakdown.id = 'v51CalendarBreakdown'; if (dayDetail) dayDetail.before(breakdown); else card.after(breakdown); }
  breakdown.replaceChildren();
  const catWrap = el('div'); catWrap.append(el('h3', '', 'Top spending categories'));
  const catList = el('div', 'v51-mini-list');
  const monthDays = end.getDate();
  categorySummary(monthDays, first).slice(0, 5).forEach(row => {
    const line = el('div', 'v51-mini-row'); line.append(el('span', '', categoryName(store.data, row.id)), el('strong', '', money(row.amount))); catList.append(line);
  });
  catWrap.append(catList);

  const dayMap = new Map();
  events.forEach(event => {
    const key = toISODateLocal(event.date);
    if (!dayMap.has(key)) dayMap.set(key, { date: event.date, net: 0, count: 0 });
    const row = dayMap.get(key); row.net += Number(event.amount || 0); row.count += 1;
  });
  const cashDays = [...dayMap.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 5);
  const dayWrap = el('div'); dayWrap.append(el('h3', '', 'Largest cash-flow days'));
  const dayList = el('div', 'v51-mini-list');
  cashDays.forEach(row => {
    const line = el('div', 'v51-mini-row');
    line.append(el('span', '', `${row.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${row.count} item${row.count === 1 ? '' : 's'}`), el('strong', row.net >= 0 ? 'positive' : 'negative', signedMoney(row.net)));
    dayList.append(line);
  });
  dayWrap.append(dayList);
  breakdown.append(catWrap, dayWrap);

  const gridFirst = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  const byDay = new Map();
  events.forEach(event => {
    const key = toISODateLocal(event.date);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  });
  view.querySelectorAll('.calendar-day').forEach((button, index) => {
    button.querySelector('.v51-day-flow')?.remove();
    const date = addDays(gridFirst, index);
    const rows = byDay.get(toISODateLocal(date)) || [];
    if (!rows.length) return;
    const flow = el('div', 'v51-day-flow');
    if (rows.some(row => row.type === 'income')) flow.append(el('span', 'v51-flow-dot income'));
    if (rows.some(row => row.type === 'expense')) flow.append(el('span', 'v51-flow-dot expense'));
    button.append(flow);
  });
}

function ensureTooltip() {
  if (tooltip) return tooltip;
  tooltip = el('div', 'v51-chart-tooltip');
  tooltip.id = 'v51ChartTooltip';
  document.body.append(tooltip);
  return tooltip;
}

function nearestPoint(series, targetTime) {
  if (!series?.length) return null;
  let best = series[0], bestDistance = Math.abs(series[0].x.getTime() - targetTime);
  for (let i = 1; i < series.length; i += 1) {
    const distance = Math.abs(series[i].x.getTime() - targetTime);
    if (distance < bestDistance) { best = series[i]; bestDistance = distance; }
  }
  return best;
}

function genericChartDescriptor(canvas) {
  const meta = canvas._chartMeta;
  if (!meta?.series?.length) return null;
  const labels = canvas.id === 'v5HistoryChart'
    ? ['Actual balance', 'Comparison']
    : canvas.id === 'v5OptimizationChart'
      ? ['Current plan', 'Without expense']
      : ['Plan', 'Scenario'];
  return {
    minX: meta.minX, maxX: meta.maxX, pad: meta.pad, plotW: meta.plotW,
    primary: meta.series,
    series: [
      { label: labels[0], points: meta.series },
      ...(meta.comparison?.length ? [{ label: labels[1], points: meta.comparison }] : [])
    ]
  };
}

function showChartTooltip(canvas, event) {
  const meta = canvas._v51ChartMeta || genericChartDescriptor(canvas);
  if (!meta?.primary?.length) return;
  const rect = canvas.getBoundingClientRect();
  const localX = Math.max(meta.pad.left, Math.min(rect.width - meta.pad.right, event.clientX - rect.left));
  const ratio = Math.max(0, Math.min(1, (localX - meta.pad.left) / Math.max(meta.plotW, 1)));
  const targetTime = meta.minX + ratio * (meta.maxX - meta.minX);
  const primary = nearestPoint(meta.primary, targetTime);
  if (!primary) return;
  const target = ensureTooltip();
  target.replaceChildren(el('div', 'v51-chart-tooltip-date', primary.x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })));
  meta.series.forEach(series => {
    const point = nearestPoint(series.points, primary.x.getTime());
    if (!point) return;
    const row = el('div', 'v51-chart-tooltip-row'); row.append(el('span', '', series.label), el('strong', '', money(point.y))); target.append(row);
  });
  if (meta.confidence) {
    const lower = nearestPoint(meta.confidence.lower, primary.x.getTime());
    const upper = nearestPoint(meta.confidence.upper, primary.x.getTime());
    if (lower && upper) {
      const row = el('div', 'v51-chart-tooltip-row'); row.append(el('span', '', 'Confidence'), el('strong', '', `${money(lower.y)} – ${money(upper.y)}`)); target.append(row);
    }
  }
  const left = Math.min(window.innerWidth - 255, event.clientX + 14);
  const top = Math.min(window.innerHeight - 160, event.clientY + 14);
  target.style.left = `${Math.max(8, left)}px`;
  target.style.top = `${Math.max(8, top)}px`;
  target.classList.add('show');
}

function hideTooltip() { tooltip?.classList.remove('show'); }

function bindChartInteractions() {
  document.querySelectorAll('#balanceChart,#v5AdaptiveChart,#v5HistoryChart,#v5OptimizationChart').forEach(canvas => {
    if (canvas.dataset.v51Interactive) return;
    canvas.dataset.v51Interactive = '1';
    canvas.addEventListener('pointerdown', event => {
      canvas._v51Dragging = true;
      try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
      showChartTooltip(canvas, event);
    });
    canvas.addEventListener('pointermove', event => {
      if (event.pointerType === 'mouse' || canvas._v51Dragging) showChartTooltip(canvas, event);
    });
    canvas.addEventListener('pointerup', event => {
      canvas._v51Dragging = false;
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
      if (event.pointerType !== 'mouse') hideTooltip();
    });
    canvas.addEventListener('pointercancel', () => { canvas._v51Dragging = false; hideTooltip(); });
    canvas.addEventListener('pointerleave', event => { if (!canvas._v51Dragging || event.pointerType === 'mouse') hideTooltip(); });
  });
}

function forceVisibleChartRedraw() {
  window.dispatchEvent(new Event('resize'));
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    renderAdaptiveForSelectedRange();
    bindChartInteractions();
  }));
  window.setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    renderAdaptiveForSelectedRange();
  }, 260);
}

function enhance() {
  ensureStyles();
  optimizeDashboardLayout();
  renderAdaptiveForSelectedRange();
  renderDashboardCategories();
  renderCategoryExplorer();
  renderCalendarEnhancements();
  bindChartInteractions();
}

function scheduleEnhance() {
  window.clearTimeout(enhanceTimer);
  enhanceTimer = window.setTimeout(() => window.requestAnimationFrame(enhance), 0);
}

function watchViews() {
  document.addEventListener('click', event => {
    if (event.target.closest('[data-view],[data-view-jump],#calendarPrev,#calendarNext,#calendarToday')) {
      window.setTimeout(() => { scheduleEnhance(); forceVisibleChartRedraw(); }, 0);
    }
  });
  const views = document.querySelectorAll('.view');
  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.attributeName === 'class')) {
      scheduleEnhance();
      forceVisibleChartRedraw();
    }
  });
  views.forEach(view => observer.observe(view, { attributes: true, attributeFilter: ['class'] }));
  const calendarTitle = $('#calendarTitle');
  if (calendarTitle) new MutationObserver(scheduleEnhance).observe(calendarTitle, { childList: true, characterData: true, subtree: true });
}

ensureStyles();
window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
  enhance();
  watchViews();
  forceVisibleChartRedraw();
}));
store.subscribe(scheduleEnhance);
