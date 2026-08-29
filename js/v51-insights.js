const VERSION = '5.1.0';
let observer;

function $(selector) { return document.querySelector(selector); }
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function ensureStyles() {
  if ($('#v51InsightsStyles')) return;
  const link = document.createElement('link');
  link.id = 'v51InsightsStyles';
  link.rel = 'stylesheet';
  link.href = './css/v51-insights.css?v=5.1.0';
  document.head.append(link);
}

function setVersionLabels() {
  const brand = $('#brandVersion');
  const app = $('#appVersion');
  if (brand) brand.textContent = `v${VERSION}`;
  if (app) app.textContent = VERSION;

  const dashboardCopy = $('#view-overview .page-head .subtle');
  if (dashboardCopy && dashboardCopy.textContent.includes('V5 learns')) {
    dashboardCopy.textContent = 'Update your account totals when you check in. V5.1 learns from those snapshots and improves the forecast without asking you to maintain transaction actuals.';
  }
}

function disclosure(id, title, description) {
  let details = $(`#${id}`);
  if (details) return details;
  details = el('details', 'v51-insights-disclosure');
  details.id = id;
  const summary = el('summary');
  const copy = el('span', 'v51-disclosure-copy');
  copy.append(el('strong', '', title), el('small', '', description));
  summary.append(copy, el('span', 'v51-disclosure-chevron', '›'));
  const body = el('div', 'v51-disclosure-body');
  details.append(summary, body);
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 220);
  });
  return details;
}

function declutterInsights() {
  const view = $('#view-insights');
  const head = view?.querySelector('.page-head');
  const health = $('#v5HealthSection');
  const history = $('#v5HistorySection');
  const categories = $('#v51CategoryExplorer');
  const goal = $('#v5GoalOutlookSection');
  const optimizer = $('#v5OptimizationSection');
  if (!view || !head || !health || !history) return false;

  // V5 intelligence supersedes the older generic V4 insight cards.
  $('#insightsGrid')?.classList.add('v51-legacy-insights');
  $('#categoryInsights')?.closest('.dashboard-grid')?.classList.add('v51-legacy-insights');

  health.classList.add('v51-insights-health');
  history.classList.add('v51-insights-history');
  categories?.classList.add('v51-insights-categories');

  const historyCard = history.querySelector('.v5-history-card');
  historyCard?.classList.add('v51-primary-history-card');
  if (historyCard && !historyCard.querySelector('.v51-history-hint')) {
    historyCard.querySelector('.card-head')?.after(el('div', 'v51-history-hint', 'Hover or drag across the chart to inspect a balance on any check-in date.'));
  }

  // Main scan path: health -> actual trend -> category intelligence.
  head.after(health);
  health.after(history);
  if (categories) history.after(categories);

  const obligation = history.querySelector('.v5-obligation-card');
  const planning = disclosure(
    'v51PlanningDisclosure',
    'Planning details',
    'Major obligations and goal timing — available when you need the deeper view.'
  );
  const planningBody = planning.querySelector('.v51-disclosure-body');
  if (obligation && obligation.parentElement !== planningBody) planningBody.append(obligation);
  if (goal && goal.parentElement !== planningBody) planningBody.append(goal);

  const optimization = disclosure(
    'v51OptimizationDisclosure',
    'Recurring expense optimizer',
    'Open the five-year what-if analysis only when you are reviewing recurring costs.'
  );
  const optimizationBody = optimization.querySelector('.v51-disclosure-body');
  if (optimizer && optimizer.parentElement !== optimizationBody) optimizationBody.append(optimizer);

  const anchor = categories || history;
  if (planning.parentElement !== view) anchor.after(planning);
  else if (planning.previousElementSibling !== anchor) anchor.after(planning);
  if (optimization.parentElement !== view) planning.after(optimization);
  else if (optimization.previousElementSibling !== planning) planning.after(optimization);

  return true;
}

function apply() {
  ensureStyles();
  setVersionLabels();
  declutterInsights();
}

function schedule() {
  window.requestAnimationFrame(() => window.requestAnimationFrame(apply));
}

schedule();
window.addEventListener('load', schedule, { once: true });
document.addEventListener('click', event => {
  if (event.target.closest('[data-view="insights"],[data-view-jump="insights"]')) window.setTimeout(schedule, 0);
});

const insights = $('#view-insights');
if (insights) {
  observer = new MutationObserver(schedule);
  observer.observe(insights, { childList: true, subtree: false });
}
