import { store } from './store.js';
import { categoryName } from './categories.js';
import { addDays, money, parseISODate, toISODateLocal } from './utils.js';
import { annualized, combinedBalance, itemsInRange, next12Months, simulateBalance, totals } from './forecast.js';
import { fundMetrics, goalMetrics } from './planning.js';
import {
  adaptiveForecast,
  balanceTrend,
  financialHealth,
  forecastLearning,
  futureObligations,
  goalOutlook,
  purchaseImpact,
  recurringMonthlyExpenses,
  recurringMonthlyIncome,
  safeToSpend
} from './intelligence.js';
import { AI_MODES, buildChatGPTUrl, buildPrompt, modeQuestion } from './v54-ai-core.js';

const DAY_MS = 86400000;
const RANGE_LABELS = new Map([[90, '3 months'], [180, '6 months'], [365, '12 months'], [730, '24 months'], [1826, '5 years']]);
let activeAction = null;
let activeContext = [];
let enhanceTimer = 0;

const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const pct = value => value == null ? 'Learning' : `${Math.round(Number(value || 0) * 100)}%`;
const signedMoney = value => `${Number(value) >= 0 ? '+' : ''}${money(value)}`;
const itemName = item => String(item?.description || item?.name || 'Planned item').replace(/\s+/g, ' ').trim().slice(0, 90);

function ensureStyles() {
  if ($('#v54ChatGPTStyles')) return;
  const link = document.createElement('link');
  link.id = 'v54ChatGPTStyles';
  link.rel = 'stylesheet';
  link.href = './css/v54-chatgpt.css?v=5.4.0';
  document.head.append(link);
}

function activeHorizon() {
  const settings = store.data.settings || {};
  if (settings.targetMode === 'date' && parseISODate(settings.targetDate)) {
    const to = parseISODate(settings.targetDate);
    return { to, label: toISODateLocal(to) };
  }
  const days = Math.max(1, Number(settings.targetRangeDays || 365));
  return { to: addDays(new Date(), days), label: RANGE_LABELS.get(days) || `${days} days` };
}

function categoryRows(days = 365, from = new Date()) {
  const events = itemsInRange(store.data, from, addDays(from, days), { includeOverrides: false, includeScenario: false })
    .filter(event => event.type === 'expense');
  const rows = new Map();
  for (const event of events) {
    const id = event.category || 'other';
    const current = rows.get(id) || { id, amount: 0, count: 0 };
    current.amount += Math.abs(Number(event.amount || 0));
    current.count += 1;
    rows.set(id, current);
  }
  const total = [...rows.values()].reduce((sum, row) => sum + row.amount, 0);
  return [...rows.values()]
    .map(row => ({ ...row, share: total ? row.amount / total : 0, monthly: row.amount * 30.4375 / Math.max(1, days) }))
    .sort((a, b) => b.amount - a.amount);
}

function basicForecastLines() {
  const now = new Date();
  const horizon = activeHorizon();
  const adaptive = adaptiveForecast(store.data, horizon.to, now);
  const learning = forecastLearning(store.data);
  const safe = safeToSpend(store.data);
  const next = next12Months(store.data, now, { includeOverrides: false });
  return [
    `Current net balance: ${money(combinedBalance(store.data))}`,
    `Expected income over the next 12 months: ${money(next.income)}`,
    `Expected spending over the next 12 months: ${money(next.expense)}`,
    `Planned 12-month balance change: ${signedMoney(next.net)}`,
    `Selected forecast horizon: ${horizon.label}`,
    `Original planned ending balance for that horizon: ${money(adaptive.plan.endBalance)}`,
    `Adaptive ending balance for that horizon: ${money(adaptive.endBalance)}`,
    adaptive.adaptive ? `Adaptive confidence range: ${money(adaptive.lowerEnd)} to ${money(adaptive.upperEnd)}` : 'Adaptive forecast status: still learning from balance history',
    `Safe-to-spend planning amount: ${money(safe.safeToSpend)}`,
    `Emergency reserve used by the planner: ${money(safe.emergencyReserve)} (${safe.emergencyMonths} months of recurring expenses)`,
    `Major-obligation reserve inside 12 months: ${money(safe.obligationReserve)}`,
    `Typical spending not represented in the plan: ${learning.intervalCount ? `${money(learning.monthlyUnmodeledSpend)}/month` : 'still learning'}`,
    `Forecast accuracy from balance history: ${pct(learning.accuracy)}`
  ];
}

function dashboardContext() {
  const rows = categoryRows(365).slice(0, 6);
  const obligations = futureObligations(store.data, 365).slice(0, 5);
  return [
    ...basicForecastLines(),
    ...rows.map(row => `Spending category ${categoryName(store.data, row.id)}: ${money(row.amount)} over 12 months (${pct(row.share)} of planned spending, about ${money(row.monthly)}/month)`),
    ...obligations.map(item => `Major obligation: ${itemName(item)} — ${money(item.amount)} on ${item.date}`)
  ];
}

function adaptiveContext() {
  const horizon = activeHorizon();
  const forecast = adaptiveForecast(store.data, horizon.to, new Date());
  const learning = forecastLearning(store.data);
  const trend = balanceTrend(store.data);
  return [
    `Current net balance: ${money(combinedBalance(store.data))}`,
    `Forecast horizon: ${horizon.label}`,
    `Original planned ending balance: ${money(forecast.plan.endBalance)}`,
    `Adaptive ending balance: ${money(forecast.endBalance)}`,
    forecast.adaptive ? `Confidence range: ${money(forecast.lowerEnd)} to ${money(forecast.upperEnd)}` : 'Adaptive adjustment: not established yet',
    `Balance-history points: ${learning.historyCount}`,
    `Forecast intervals learned from: ${learning.intervalCount}`,
    `Forecast accuracy: ${pct(learning.accuracy)}`,
    `Typical spending not represented in the plan: ${learning.intervalCount ? `${money(learning.monthlyUnmodeledSpend)}/month` : 'still learning'}`,
    `Uncertainty in the learned monthly difference: ${learning.intervalCount ? `${money(learning.monthlyUncertainty)}/month` : 'still learning'}`,
    `Observed balance trend: ${signedMoney(trend.change)} across ${trend.days} days`,
    `Observed monthly balance pace: ${signedMoney(trend.monthlyPace)}/month`
  ];
}

function watchContext() {
  const safe = safeToSpend(store.data);
  const horizon = activeHorizon();
  const plan = simulateBalance(store.data, horizon.to, new Date(), { includeOverrides: false, includeScenario: true });
  const learning = forecastLearning(store.data);
  const obligations = futureObligations(store.data, 365).slice(0, 8);
  return [
    `Current net balance: ${money(safe.cash)}`,
    `Safe-to-spend planning amount: ${money(safe.safeToSpend)}`,
    `Emergency reserve: ${money(safe.emergencyReserve)}`,
    `Major obligations reserved: ${money(safe.obligationReserve)}`,
    `Selected plan ending balance: ${money(plan.endBalance)}`,
    plan.daysToNegative == null ? 'Planned balance does not go below zero in the selected horizon' : `Planned balance first goes below zero in about ${plan.daysToNegative} days`,
    `Typical spending not represented in plan: ${learning.intervalCount ? `${money(learning.monthlyUnmodeledSpend)}/month` : 'still learning'}`,
    ...obligations.map(item => `Upcoming major obligation: ${itemName(item)} — ${money(item.amount)} on ${item.date}`)
  ];
}

function categoriesContext() {
  const rows = categoryRows(365);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return [
    `Total planned spending over the next 12 months: ${money(total)}`,
    ...rows.slice(0, 10).map(row => `${categoryName(store.data, row.id)}: ${money(row.amount)} (${pct(row.share)} of planned spending, about ${money(row.monthly)}/month)`)
  ];
}

function purchaseContext() {
  const amount = Math.max(0, Number($('#v5PurchaseAmount')?.value || 0));
  const date = $('#v5PurchaseDate')?.value || toISODateLocal(new Date());
  const safe = safeToSpend(store.data);
  if (!amount) {
    return [
      `No purchase amount is currently entered in the decision tool`,
      `Current net balance: ${money(safe.cash)}`,
      `Safe-to-spend planning amount before a purchase: ${money(safe.safeToSpend)}`,
      `Emergency reserve: ${money(safe.emergencyReserve)}`,
      `Major-obligation reserve: ${money(safe.obligationReserve)}`
    ];
  }
  const impact = purchaseImpact(store.data, amount, date);
  return [
    `Purchase being tested: ${money(amount)} on ${impact.date}`,
    `Planner risk classification: ${impact.risk}`,
    `Safe-to-spend before purchase: ${money(impact.safeBefore)}`,
    `Safe-to-spend after purchase: ${money(impact.safeAfter)}`,
    `12-month adaptive ending balance before purchase: ${money(impact.baselineEnd)}`,
    `12-month adaptive ending balance after purchase: ${money(impact.endBalance)}`,
    `Lowest projected balance after purchase: ${money(impact.minBalance)}`,
    `Emergency reserve used by planner: ${money(safe.emergencyReserve)}`,
    `Major-obligation reserve used by planner: ${money(safe.obligationReserve)}`
  ];
}

function calendarRange() {
  const title = $('#calendarTitle')?.textContent?.trim() || '';
  const match = title.match(/^([A-Za-z]+)\s+(\d{4})$/);
  const parsed = match ? new Date(`${match[1]} 1, ${match[2]} 12:00:00`) : new Date();
  const month = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const from = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  return { from, to, label: from.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
}

function calendarContext() {
  const { from, to, label } = calendarRange();
  const events = itemsInRange(store.data, from, to, { includeOverrides: false, includeScenario: true });
  const period = totals(store.data, from, to, { includeOverrides: false, includeScenario: true });
  const daily = new Map();
  const categories = new Map();
  for (const event of events) {
    const day = toISODateLocal(event.date);
    daily.set(day, (daily.get(day) || 0) + Number(event.amount || 0));
    if (event.type === 'expense') categories.set(event.category || 'other', (categories.get(event.category || 'other') || 0) + Math.abs(Number(event.amount || 0)));
  }
  const largestDays = [...daily.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  const topCategories = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return [
    `Calendar month: ${label}`,
    `Planned income: ${money(period.income)}`,
    `Planned spending: ${money(period.expense)}`,
    `Planned balance change: ${signedMoney(period.net)}`,
    `Scheduled cash-flow entries: ${events.length}`,
    ...largestDays.map(([day, amount]) => `Large cash-flow day: ${day} — ${signedMoney(amount)}`),
    ...topCategories.map(([id, amount]) => `Top spending category this month: ${categoryName(store.data, id)} — ${money(amount)}`)
  ];
}

function goalsContext() {
  const goals = store.data.goals || [];
  if (!goals.length) return ['No goals are currently saved in the planner.'];
  return goals.slice(0, 8).flatMap(goal => {
    const metrics = goalMetrics(store.data, goal);
    const outlook = goalOutlook(store.data, goal);
    return [
      `Goal ${String(goal.name || 'Goal').slice(0, 80)}: target ${money(metrics.target)}, current ${money(metrics.current)}, remaining ${money(metrics.remaining)}, progress ${pct(metrics.progress)}`,
      `Goal outlook for ${String(goal.name || 'Goal').slice(0, 80)}: ${outlook.projectedDate || (metrics.remaining === 0 ? 'reached' : 'not enough trend data')}${outlook.pace > 0 ? ` at an observed pace of ${money(outlook.pace)}/month` : ''}`
    ];
  });
}

function fundsContext() {
  const funds = store.data.funds || [];
  if (!funds.length) return ['No sinking funds are currently saved in the planner.'];
  return funds.slice(0, 8).map(fund => {
    const metrics = fundMetrics(fund);
    return `Sinking fund ${String(fund.name || 'Fund').slice(0, 80)}: target ${money(metrics.target)}, reserved ${money(metrics.reserved)}, remaining ${money(metrics.remaining)}, due ${fund.dueDate || 'no date'}${metrics.monthlyRequired != null ? `, about ${money(metrics.monthlyRequired)}/month needed` : ''}`;
  });
}

function scenarioContext() {
  const scenario = store.data.scenario || {};
  return [
    `What-if scenario status: ${scenario.enabled ? 'enabled' : 'disabled'}`,
    `Scenario name: ${String(scenario.name || 'Unnamed scenario').slice(0, 80)}`,
    `Monthly income change: ${signedMoney(Number(scenario.monthlyIncomeDelta || 0))}`,
    `Monthly spending change: ${signedMoney(-Math.abs(Number(scenario.monthlyExpenseDelta || 0)))}`,
    `One-time balance change: ${signedMoney(Number(scenario.oneTimeDelta || 0))}${scenario.oneTimeDate ? ` on ${scenario.oneTimeDate}` : ''}`
  ];
}

function planContext() {
  return [...goalsContext(), ...fundsContext(), ...scenarioContext()];
}

function insightsContext() {
  const trend = balanceTrend(store.data);
  const learning = forecastLearning(store.data);
  const safe = safeToSpend(store.data);
  const health = financialHealth(store.data);
  return [
    `Balance-history points: ${learning.historyCount}`,
    `Observed balance change: ${signedMoney(trend.change)} across ${trend.days} days`,
    `Observed monthly balance pace: ${signedMoney(trend.monthlyPace)}/month`,
    `Forecast accuracy: ${pct(learning.accuracy)}`,
    `Typical spending not represented in plan: ${learning.intervalCount ? `${money(learning.monthlyUnmodeledSpend)}/month` : 'still learning'}`,
    `Safe-to-spend planning amount: ${money(safe.safeToSpend)}`,
    ...health.map(item => `${item.label}: ${item.kind === 'currency' ? money(item.value) : item.kind === 'percent' ? pct(item.value) : String(item.value)} — status ${item.status}; ${String(item.detail || '').slice(0, 150)}`)
  ];
}

function historyContext() {
  const trend = balanceTrend(store.data);
  const learning = forecastLearning(store.data);
  const history = trend.history || [];
  return [
    `Balance-history points: ${history.length}`,
    history.length ? `First recorded net balance: ${money(history[0].total)} on ${history[0].date}` : 'No balance history has been recorded yet',
    history.length ? `Latest recorded net balance: ${money(history.at(-1).total)} on ${history.at(-1).date}` : '',
    `Total observed balance change: ${signedMoney(trend.change)}`,
    `Observed monthly balance pace: ${signedMoney(trend.monthlyPace)}/month`,
    `Forecast accuracy: ${pct(learning.accuracy)}`,
    `Typical spending not represented in plan: ${learning.intervalCount ? `${money(learning.monthlyUnmodeledSpend)}/month` : 'still learning'}`
  ].filter(Boolean);
}

function expensesContext() {
  const next = next12Months(store.data, new Date(), { includeOverrides: false });
  const recurring = (store.data.expenses || []).filter(item => item.active !== false && item.frequency !== 'once')
    .map(item => ({ item, annual: annualized(item) })).sort((a, b) => b.annual - a.annual).slice(0, 10);
  return [
    `Expected spending over the next 12 months: ${money(next.expense)}`,
    `Recurring monthly spending pace: ${money(recurringMonthlyExpenses(store.data))}/month`,
    `Active planned expense items: ${(store.data.expenses || []).filter(item => item.active !== false).length}`,
    ...recurring.map(({ item, annual }) => `Recurring expense ${itemName(item)}: ${money(item.amount)} ${item.frequency}, about ${money(annual)}/year, category ${categoryName(store.data, item.category || 'other')}`),
    ...categoriesContext().slice(1, 7)
  ];
}

function incomesContext() {
  const next = next12Months(store.data, new Date(), { includeOverrides: false });
  const recurring = (store.data.incomes || []).filter(item => item.active !== false && item.frequency !== 'once')
    .map(item => ({ item, annual: annualized(item) })).sort((a, b) => b.annual - a.annual).slice(0, 10);
  return [
    `Expected income over the next 12 months: ${money(next.income)}`,
    `Recurring monthly income pace: ${money(recurringMonthlyIncome(store.data))}/month`,
    `Active planned income items: ${(store.data.incomes || []).filter(item => item.active !== false).length}`,
    ...recurring.map(({ item, annual }) => `Recurring income ${itemName(item)}: ${money(item.amount)} ${item.frequency}, about ${money(annual)}/year`)
  ];
}

function settingsContext() {
  const intelligence = store.data.settings?.intelligence || {};
  return [
    `Adaptive forecast setting: ${intelligence.adaptiveForecast === false ? 'off' : 'on'}`,
    `Emergency reserve setting: ${Number(intelligence.emergencyMonths || 3)} months of recurring expenses`,
    `Major-obligation threshold: ${money(Number(intelligence.majorExpenseThreshold || 1000))}`,
    `Financial data is stored locally in this browser by default`,
    `Google Drive backup is optional and uses the drive.file permission`,
    `Ask ChatGPT is optional and sends only the previewed summary after the user presses Open in ChatGPT`
  ];
}

const ACTIONS = {
  dashboard: { title: 'Your financial picture', question: 'Give me a plain-English synopsis of my overall financial position. What looks healthy, what deserves attention, and what should I focus on?', context: dashboardContext },
  adaptive: { title: 'Adaptive forecast', question: 'Explain why my adaptive forecast differs from the original plan, how much confidence I should place in it, and what the main implication is.', context: adaptiveContext },
  watch: { title: 'Things to watch', question: 'Explain the most important financial risks or timing issues in this plan without making them sound more serious than the numbers support.', context: watchContext },
  categories: { title: 'Spending categories', question: 'Explain where my planned spending is going, which categories have the biggest financial effect, and what is worth reviewing.', context: categoriesContext },
  purchase: { title: 'Purchase check', question: 'Explain this purchase test in plain English. Tell me what the planner says changes, what the risk level means, and what I should consider before deciding.', context: purchaseContext },
  calendar: { title: 'Monthly cash-flow calendar', question: 'Summarize this month. Point out the dates or parts of the month that may feel tight and explain why.', context: calendarContext },
  plan: { title: 'Goals, funds, and what-if plan', question: 'Review my goals, sinking funds, and current what-if scenario. Explain whether the plan looks internally consistent and what deserves attention.', context: planContext },
  goals: { title: 'Goals', question: 'Explain my goal progress and which goals may need changes to timing, target, or saving pace.', context: goalsContext },
  funds: { title: 'Sinking funds', question: 'Explain whether my sinking funds appear on pace and which future costs may need more preparation.', context: fundsContext },
  scenario: { title: 'What-if scenario', question: 'Explain the financial effect of this what-if scenario and the tradeoffs it represents.', context: scenarioContext },
  insights: { title: 'Financial insights', question: 'Give me a plain-English financial health synopsis using these signals. Separate established patterns from areas where the planner is still learning.', context: insightsContext },
  history: { title: 'Balance over time', question: 'Explain my balance trend and what it suggests about how my real financial position has been changing.', context: historyContext },
  expenses: { title: 'Expense plan', question: 'Review my planned expenses. Explain the biggest recurring commitments, the categories with the most impact, and where a change would matter most.', context: expensesContext },
  incomes: { title: 'Income plan', question: 'Review my planned income. Explain how concentrated or stable it appears from the schedule and what changes would have the biggest effect.', context: incomesContext },
  settings: { title: 'Finance Planner settings', question: 'Explain these planner settings in simple terms and how they affect the forecasts, reserves, privacy, and backups.', context: settingsContext }
};

function ensureDialog() {
  if ($('#v54ChatGPTDialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'v54ChatGPTDialog';
  dialog.className = 'v54-ai-dialog';
  dialog.innerHTML = `
    <form method="dialog" class="v54-ai-shell">
      <div class="v54-ai-head"><div><div class="v54-ai-kicker">Ask ChatGPT</div><h2 id="v54AiTitle">Finance Planner</h2><p>Finance Planner prepares a focused summary. Nothing is sent until you choose Open in ChatGPT.</p></div><button class="icon-button" value="cancel" aria-label="Close">×</button></div>
      <div class="v54-mode-row" role="group" aria-label="AI analysis style">
        <button type="button" class="v54-mode active" data-ai-mode="summary">Synopsis</button>
        <button type="button" class="v54-mode" data-ai-mode="explain">Explain</button>
        <button type="button" class="v54-mode" data-ai-mode="analyze">Analyze</button>
        <button type="button" class="v54-mode" data-ai-mode="actions">Next steps</button>
      </div>
      <div class="field"><label for="v54AiQuestion">What do you want ChatGPT to do?</label><textarea class="input v54-question" id="v54AiQuestion" rows="3"></textarea></div>
      <section class="v54-share-box"><div class="v54-share-title"><strong>Information that will be shared</strong><span id="v54AiLineCount"></span></div><pre id="v54AiContext"></pre></section>
      <div class="v54-ai-warning"><strong>Privacy note:</strong> Open in ChatGPT places this selected summary in the ChatGPT link, so it may appear in browser history. Finance Planner does not send the full JSON, Google Drive contents, OAuth tokens, or hidden account data. Use Copy prompt if you prefer to paste it yourself.</div>
      <details class="v54-prompt-details"><summary>View the full prompt</summary><pre id="v54AiPrompt"></pre></details>
      <div class="v54-ai-status" id="v54AiStatus" aria-live="polite"></div>
      <div class="dialog-actions v54-ai-actions"><button class="button" type="button" id="v54CopyPrompt">Copy prompt</button><button class="button primary" type="button" id="v54OpenChatGPT">Open in ChatGPT ↗</button></div>
    </form>`;
  document.body.append(dialog);

  all('[data-ai-mode]').forEach(button => button.addEventListener('click', () => {
    all('[data-ai-mode]').forEach(item => item.classList.toggle('active', item === button));
    const question = $('#v54AiQuestion');
    if (question) question.value = modeQuestion(button.dataset.aiMode);
    refreshPromptPreview();
  }));
  $('#v54AiQuestion')?.addEventListener('input', refreshPromptPreview);
  $('#v54CopyPrompt')?.addEventListener('click', copyPrompt);
  $('#v54OpenChatGPT')?.addEventListener('click', openChatGPT);
}

function currentQuestion() {
  return $('#v54AiQuestion')?.value?.trim() || activeAction?.question || AI_MODES.summary;
}

function currentPrompt() {
  return buildPrompt({ title: activeAction?.title || 'Finance Planner', question: currentQuestion(), contextLines: activeContext });
}

function refreshPromptPreview() {
  const prompt = currentPrompt();
  if ($('#v54AiPrompt')) $('#v54AiPrompt').textContent = prompt;
  if ($('#v54AiContext')) $('#v54AiContext').textContent = activeContext.map(line => `• ${line}`).join('\n');
  if ($('#v54AiLineCount')) $('#v54AiLineCount').textContent = `${activeContext.length} summary items`;
}

async function copyPrompt() {
  const prompt = currentPrompt();
  const status = $('#v54AiStatus');
  try {
    await navigator.clipboard.writeText(prompt);
    if (status) status.textContent = 'Prompt copied. Paste it into any ChatGPT conversation.';
  } catch {
    const area = document.createElement('textarea');
    area.value = prompt;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    if (status) status.textContent = 'Prompt copied. Paste it into any ChatGPT conversation.';
  }
}

function openChatGPT() {
  const prompt = currentPrompt();
  const url = buildChatGPTUrl(prompt);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  const status = $('#v54AiStatus');
  if (!opened && status) status.textContent = 'Your browser blocked the new tab. Use Copy prompt, or allow pop-ups for this site.';
  else if (status) status.textContent = 'Opened ChatGPT with this Finance Planner prompt.';
}

function showAction(key) {
  const action = ACTIONS[key];
  if (!action) return;
  ensureDialog();
  activeAction = action;
  activeContext = action.context().filter(Boolean).slice(0, 40);
  const dialog = $('#v54ChatGPTDialog');
  if ($('#v54AiTitle')) $('#v54AiTitle').textContent = action.title;
  if ($('#v54AiQuestion')) $('#v54AiQuestion').value = action.question;
  all('[data-ai-mode]').forEach(button => button.classList.toggle('active', button.dataset.aiMode === 'summary'));
  if ($('#v54AiStatus')) $('#v54AiStatus').textContent = '';
  refreshPromptPreview();
  if (!dialog.open) dialog.showModal();
}

function makeAiButton(key, compact = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = compact ? 'v54-ai-icon' : 'button small v54-page-ai';
  button.dataset.aiAction = key;
  button.setAttribute('aria-label', `Ask ChatGPT about ${ACTIONS[key]?.title || 'this section'}`);
  button.title = `Ask ChatGPT about ${ACTIONS[key]?.title || 'this section'}`;
  if (compact) button.textContent = '✦';
  else button.innerHTML = '<span aria-hidden="true">✦</span> Ask ChatGPT';
  button.addEventListener('click', () => showAction(key));
  return button;
}

function addPageButton(viewId, key) {
  const view = document.getElementById(`view-${viewId}`);
  const head = view?.querySelector('.page-head');
  if (!head || head.querySelector(`.v54-page-ai[data-ai-action="${key}"]`)) return;
  let actions = head.querySelector('.head-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'head-actions';
    head.append(actions);
  }
  actions.prepend(makeAiButton(key, false));
}

function addSectionButton(target, key) {
  if (!target || target.querySelector?.(`.v54-ai-icon[data-ai-action="${key}"]`)) return;
  const header = target.matches?.('.section-head,.card-head') ? target : target.querySelector?.('.card-head,.section-head') || target;
  if (!header) return;
  const button = makeAiButton(key, true);
  button.dataset.aiAction = key;
  let actions = header.querySelector(':scope > .v54-section-ai-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'v54-section-ai-actions';
    header.append(actions);
  }
  actions.append(button);
}

function enhance() {
  addPageButton('overview', 'dashboard');
  addPageButton('calendar', 'calendar');
  addPageButton('plan', 'plan');
  addPageButton('insights', 'insights');
  addPageButton('expenses', 'expenses');
  addPageButton('incomes', 'incomes');
  addPageButton('settings', 'settings');

  addSectionButton($('#v5AdaptiveCard'), 'adaptive');
  addSectionButton($('#v5PurchaseCard'), 'purchase');
  addSectionButton($('#radarMini')?.closest('.radar-card'), 'watch');
  addSectionButton($('#categoryOverview')?.closest('.category-card'), 'categories');
  addSectionButton($('#view-calendar .calendar-card'), 'calendar');
  addSectionButton($('#goalsGrid')?.previousElementSibling, 'goals');
  addSectionButton($('#fundsGrid')?.previousElementSibling, 'funds');
  addSectionButton($('#view-plan .scenario-card'), 'scenario');
  addSectionButton($('#v5HealthSection')?.querySelector('.section-head'), 'insights');
  addSectionButton($('#v5HistorySection .v5-history-card'), 'history');
  addSectionButton($('#v51CategoryExplorer'), 'categories');
  addSectionButton($('#v5GoalOutlookSection'), 'goals');
  addSectionButton($('#v5OptimizationSection'), 'expenses');
}

function scheduleEnhance() {
  window.clearTimeout(enhanceTimer);
  enhanceTimer = window.setTimeout(enhance, 40);
}

function init() {
  ensureStyles();
  ensureDialog();
  enhance();
  store.subscribe(scheduleEnhance);
  const observer = new MutationObserver(scheduleEnhance);
  const content = $('.content');
  if (content) observer.observe(content, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
