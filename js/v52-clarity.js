export const VERSION = '5.2.0';

let queued = false;
let dialog = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function ownText(node) {
  return [...(node?.childNodes || [])].find(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
}

function setText(selector, text, root = document) {
  const node = $(selector, root);
  if (!node) return;
  const help = node.querySelector?.(':scope > .v52-info-button');
  if (!help) {
    if (node.textContent !== text) node.textContent = text;
    return;
  }
  let textNode = ownText(node);
  if (!textNode) {
    textNode = document.createTextNode(text);
    node.insertBefore(textNode, help);
  } else if (textNode.textContent.trim() !== text) {
    textNode.textContent = text;
  }
}

function setWithin(parentSelector, childSelector, text) {
  const node = $(parentSelector)?.querySelector(childSelector);
  if (node) setNodeText(node, text);
}

function setNodeText(node, text) {
  if (!node) return;
  const help = node.querySelector?.(':scope > .v52-info-button');
  if (!help) {
    if (node.textContent !== text) node.textContent = text;
    return;
  }
  let textNode = ownText(node);
  if (!textNode) node.insertBefore(document.createTextNode(text), help);
  else if (textNode.textContent.trim() !== text) textNode.textContent = text;
}

function setLabel(id, text) {
  setNodeText(document.querySelector(`label[for="${id}"]`), text);
}

function setMetricLabel(valueId, text) {
  const value = document.getElementById(valueId);
  const label = value?.closest('.kpi-card,.v5-intel-card')?.querySelector('.kpi-label,.v5-label');
  if (label) setNodeText(label, text);
}

function ensureStyles() {
  if ($('#v52ClarityStyles')) return;
  const link = document.createElement('link');
  link.id = 'v52ClarityStyles';
  link.rel = 'stylesheet';
  link.href = './css/v52-clarity.css?v=5.2.0';
  document.head.append(link);
}

function cleanPages() {
  document.documentElement.dataset.financePlannerVersion = VERSION;
  setText('#brandVersion', `v${VERSION}`);
  setText('#appVersion', VERSION);
  setText('.topbar-title', 'Finance Planner');
  setText('#topbarStatus', 'Your latest balances are the starting point for every forecast.');
  setText('.sidebar-foot', 'Stored in this browser. Export a backup to keep a copy.');

  setText('#view-overview .page-head h1', 'Your financial picture');
  setText('#view-overview .page-head .subtle', 'Update balances when they change. The planner combines those balances with your planned income and spending to show what may happen next.');
  setText('#view-overview .hero-label', 'Current net balance');
  setText('#view-overview .hero-caption', 'The total of the account balances you entered, including negative balances such as credit cards. Every forecast starts here.');
  setText('#view-overview .forecast-card .card-kicker', 'Planned ending balance');
  setText('#scenarioBadge', 'What-if scenario is on');
  setLabel('targetDate', 'Choose a specific end date');
  setMetricLabel('income12', 'Expected income · 12 months');
  setMetricLabel('expense12', 'Expected spending · 12 months');
  setMetricLabel('net12', 'Planned balance change · 12 months');
  setMetricLabel('cash30', 'Planned balance change · 30 days');
  setWithin('#view-overview .radar-card', 'h2', 'Things to watch');
  setWithin('#view-overview .radar-card', '.card-head p', 'Items that may need your attention based on the current plan.');
  setWithin('#view-overview .quick-card', '.card-head p', 'Add income or spending only when your plan changes.');
  setWithin('#view-overview .table-card', 'h2', 'Upcoming planned activity');

  setText('#view-calendar .page-head h1', 'Calendar');
  setText('#view-calendar .page-head .subtle', 'See which days money is expected to come in or go out. Select a day to see the items behind it.');

  setText('#view-plan .page-head h1', 'Plan ahead');
  setText('#view-plan .page-head .subtle', 'Set goals, prepare for large future costs, and test changes before adding them to your real plan.');
  const planHeads = $$('#view-plan .section-head');
  if (planHeads[0]) setNodeText(planHeads[0].querySelector('p'), 'Track a savings or balance target.');
  if (planHeads[1]) setNodeText(planHeads[1].querySelector('p'), 'Set aside money for a known future bill or purchase.');
  setWithin('#view-plan .suggestions-card', '.card-head p', 'Large scheduled costs that may be easier to save for over time.');
  setWithin('#view-plan .scenario-card', '.card-head p', 'Test a temporary change without changing your saved income or expenses.');
  setLabel('scenarioIncome', 'Monthly income change');
  setLabel('scenarioExpense', 'Monthly spending change');
  setLabel('scenarioOneTime', 'One-time balance change (+/-)');
  setLabel('scenarioOneTimeDate', 'Date of one-time change');
  setText('#saveScenario', 'Apply scenario');

  setText('#view-insights .page-head h1', 'Insights');
  setText('#view-insights .page-head .subtle', 'See what your balance history and planned cash flow are telling you. Start with the summary, then open details when you need them.');

  setText('#view-expenses .eyebrow', 'Spending plan');
  setText('#view-expenses .page-head .subtle', 'Bills and spending you expect. Change an item when its amount, date, or schedule changes.');
  setText('#view-incomes .eyebrow', 'Income plan');
  setText('#view-incomes .page-head .subtle', 'Money you expect to receive. Change an item when its amount, date, or schedule changes.');

  setText('#view-settings .page-head h1', 'Settings');
  setText('#view-settings .page-head .subtle', 'Manage accounts, categories, forecast assumptions, backups, and display preferences.');
  $$('#view-settings .settings-card').forEach(card => {
    const heading = card.querySelector('h2')?.textContent?.trim();
    const copy = card.querySelector('p');
    if (heading === 'Accounts') setNodeText(copy, 'Account balances are the source of truth. Use Update balances for normal check-ins; use Edit to rename or restructure an account.');
    if (heading === 'Categories') setNodeText(copy, 'Categories group planned spending so you can see where your money is going.');
    if (heading === 'Appearance') setNodeText(copy, 'Choose light or dark mode for this browser.');
    if (heading === 'Backup & restore') setNodeText(copy, 'Export a backup so you can restore your plan later or move it to another browser.');
    if (heading === 'Local data') setNodeText(copy, 'Your financial data stays in this browser unless you export a backup.');
  });

  setWithin('#balanceDialog', '.dialog-body .subtle', 'Enter the balances you see today. This saves a balance check-in and starts every forecast from the updated total.');
  setNodeText($('#balanceDialog .balance-inline span'), 'New total balance');
  setLabel('goalSource', 'How progress is measured');
  setLabel('goalCurrent', 'Current amount (manual)');
  setLabel('fundReserved', 'Amount already saved');
  setLabel('fundAccount', 'Saved in account');
}

function replaceLabelText(label, text) {
  if (!label) return;
  let node = [...label.childNodes].find(child => child.nodeType === Node.TEXT_NODE);
  if (!node) {
    label.append(document.createTextNode(` ${text}`));
    return;
  }
  if (node.textContent.trim() !== text) node.textContent = ` ${text}`;
}

function cleanDynamic() {
  $$('.v5-badge').forEach(node => { if (!node.hidden) node.hidden = true; });
  setMetricLabel('v5SafeSpend', 'Safe to spend');
  setMetricLabel('v5Obligations', 'Large bills · 12 months');
  setMetricLabel('v5Emergency', 'Emergency cushion');
  setMetricLabel('v5Accuracy', 'Forecast accuracy');

  const adaptiveLabels = ['Typical spending not in your plan', 'Balance check-ins', 'Average monthly balance change'];
  $$('#v5AdaptiveCard .v5-learning-row span').forEach((node, i) => adaptiveLabels[i] && setNodeText(node, adaptiveLabels[i]));
  setWithin('#v5PurchaseCard', 'h2', 'Purchase check');
  setWithin('#v5PurchaseCard', '.card-head p', 'See how a purchase would affect your forecast without adding it to your plan.');
  setNodeText($('#v5PurchaseForm button[type="submit"]'), 'Check purchase');

  setWithin('#v5HealthSection', 'h2', 'Financial snapshot');
  setWithin('#v5HealthSection', '.section-head p', 'A quick check of cash, reserves, recurring costs, and forecast risk.');
  setWithin('#v5HistorySection .v5-history-card', 'h2', 'Balance over time');
  setWithin('#v5HistorySection .v5-history-card', '.card-head p', 'How your total account balance changed each time you used Update balances.');
  const historyLabels = ['Average monthly balance change', 'Plan accuracy', 'Spending not in your plan'];
  $$('#v5HistorySection .v5-history-card .v5-learning-row span').forEach((node, i) => historyLabels[i] && setNodeText(node, historyLabels[i]));
  setWithin('#v5HistorySection .v5-obligation-card', 'h2', 'Large upcoming bills');
  setWithin('#v5HistorySection .v5-obligation-card', '.card-head p', 'Large one-time or yearly costs scheduled in the next 12 months.');
  setWithin('#v5GoalOutlookSection', 'h2', 'Goal timing');
  setWithin('#v5GoalOutlookSection', '.card-head p', 'An estimate of when you may reach each goal if your recent balance trend continues.');
  setWithin('#v5OptimizationSection', 'h2', 'Recurring cost what-if');
  setWithin('#v5OptimizationSection', '.card-head p', 'Compare the five-year forecast with and without a recurring expense. Nothing is deleted.');
  setWithin('#v51CategoryExplorer', 'h2', 'Spending by category');
  setWithin('#v51CategoryExplorer', '.card-head p', 'Select a category to see how much it contributes and which planned items make up the total.');

  setNodeText($('#v51PlanningDisclosure summary strong'), 'Goals and large bills');
  setNodeText($('#v51PlanningDisclosure summary small'), 'Open for detailed goal timing and large upcoming costs.');
  setNodeText($('#v51OptimizationDisclosure summary strong'), 'Recurring cost what-if');
  setNodeText($('#v51OptimizationDisclosure summary small'), 'See how removing a recurring expense would change the five-year forecast.');

  setWithin('#v5SettingsCard', 'h2', 'Forecast settings');
  setWithin('#v5SettingsCard', '.settings-title p', 'Choose your emergency cushion and whether forecasts should adjust using your balance history.');
  replaceLabelText($('#v5AdaptiveToggle')?.closest('label'), 'Adjust forecasts using my balance history');
  setLabel('v5EmergencyMonths', 'Emergency cushion');
  setLabel('v5MajorThreshold', 'Large bill threshold');
  setText('#v5ClearHistory', 'Clear forecast learning');
}

export const HELP = [
  ['current-balance','#view-overview .balance-hero','Current net balance','The total of the account balances you entered. Positive accounts add to it; negative balances such as credit cards reduce it.','Update balances whenever the numbers in your real accounts have meaningfully changed. Every forecast starts from this total.'],
  ['planned-ending','#view-overview .forecast-card','Planned ending balance','What your balance would be at the selected future date if the income and expenses in your plan happen as scheduled.','Use the range buttons or choose a date to answer: “If my plan happens exactly as written, where would I end up?”'],
  ['income-12','#income12','Expected income','All income scheduled in your plan for the next 12 months.','If it looks wrong, check the Income tab for an incorrect amount, date, or frequency.','.kpi-card'],
  ['spending-12','#expense12','Expected spending','All planned expenses scheduled for the next 12 months, including recurring and one-time items.','This is a planning total, not a record of what you actually spent.','.kpi-card'],
  ['change-12','#net12','Planned balance change','Expected income minus expected spending over the next 12 months.','Positive means the written plan adds to your balance. Negative means the plan uses more money than it brings in.','.kpi-card'],
  ['change-30','#cash30','30-day planned change','Expected income minus expected spending over the next 30 days.','Use this for the near-term picture. A large bill can make one month negative even when the longer-term plan is healthy.','.kpi-card'],
  ['adaptive','#v5AdaptiveCard','Adaptive forecast','Your written plan adjusted using the difference between past expected balances and the balances you actually entered.','The dashed line is the original plan. The adaptive line is the adjusted estimate. The shaded area is uncertainty. It follows the dashboard range buttons.'],
  ['safe','#v5SafeSpend','Safe to spend','A conservative estimate of money left after reserving for large scheduled bills and your chosen emergency cushion.','Use it as a planning guardrail, not permission to spend every dollar shown.','.v5-intel-card'],
  ['large-bills','#v5Obligations','Large bills','One-time and yearly expenses above your large-bill threshold that are scheduled in the next 12 months.','Use this to see how much of the current balance may already be spoken for by known large costs.','.v5-intel-card'],
  ['emergency','#v5Emergency','Emergency cushion','Recurring monthly expenses multiplied by the number of months selected in Forecast settings.','This is a planning reserve. It does not move money into a separate account.','.v5-intel-card'],
  ['accuracy','#v5Accuracy','Forecast accuracy','How closely past balance check-ins matched what the plan expected at those dates.','More check-ins make this more useful. A lower percentage means real life differed more from the written plan.','.v5-intel-card'],
  ['categories-dashboard','#categoryOverview','Where your money goes','Planned expenses grouped by category for the next 12 months.','Use this to spot the largest parts of the plan. Open Insights for item-level category details.','.category-card'],
  ['radar','#radarMini','Things to watch','A short list of conditions in the plan that may deserve attention.','These are prompts to review the plan, not warnings that something is definitely wrong.','.radar-card'],
  ['purchase','#v5PurchaseCard','Purchase check','Tests a purchase against the current forecast without adding it to your saved plan.','Enter an amount and date to see the estimated effect. Add it as an expense only if you decide it belongs in the plan.'],
  ['quick-add','#view-overview .quick-card','Quick add','A shortcut for adding planned income or spending.','Use it when the plan changes. You do not need to enter every real purchase or bank transaction.'],
  ['upcoming','#view-overview .table-card','Upcoming planned activity','A date-by-date list created from your recurring and one-time plan items.','Use it to understand why the forecast rises or falls around a particular date.'],
  ['calendar','#view-calendar .calendar-card','Calendar','Shows when planned income and spending are expected to occur during the month.','Select a day to see its items. The month summary helps identify unusually heavy or light months.'],
  ['goals','#goalsGrid','Goals','A target amount you want to reach using total cash, a specific account, or a number you update manually.','Choose the progress source that matches the goal. Insights can estimate timing when enough balance history exists.','previous:.section-head'],
  ['funds','#fundsGrid','Sinking funds','A way to gradually set money aside for a known future cost.','For example, you can plan monthly savings toward a yearly insurance bill. This does not move money between bank accounts.','previous:.section-head'],
  ['suggested-funds','#view-plan .suggestions-card','Suggested funds','Large one-time or yearly costs the planner thinks may be easier to save toward gradually.','Suggestions are optional. Create one only when you want a separate savings target for that cost.'],
  ['scenario','#view-plan .scenario-card','What-if scenario','A temporary alternate future layered on top of your real plan.','Use it to test a raise, new monthly bill, or one-time purchase. Turning it off returns to the saved plan.'],
  ['snapshot','#v5HealthSection','Financial snapshot','Simple checks covering cash, planned cash flow, emergency cushion, recurring-cost load, large bills, and forecast risk.','Read each card as a signal. There is no hidden overall score.'],
  ['history','#v5HistorySection .v5-history-card','Balance over time','Each Update balances check-in becomes another point on this graph.','Hover with a mouse or press and drag to inspect values. The trend also helps the adaptive forecast learn.'],
  ['category-details','#v51CategoryExplorer','Spending by category','Breaks the next 12 months of planned spending into categories and the items inside them.','Select a category card to change the detail panel below. Recurring means repeating spending; one-time means scheduled once.'],
  ['planning-details','#v51PlanningDisclosure','Goals and large bills','Detailed goal timing and large scheduled costs.','Keep this collapsed for a cleaner page and open it when you need the dates and amounts.'],
  ['optimizer','#v51OptimizationDisclosure','Recurring cost what-if','Shows how the five-year forecast changes if a recurring expense is temporarily removed from the comparison.','Compare does not delete the expense. Use it before deciding whether to change the real plan.'],
  ['expenses','#view-expenses .page-head','Expenses','Your plan for money going out: bills, regular spending allowances, and one-time costs.','Update an item when its amount, date, or schedule changes. You do not need to enter every real-world purchase.'],
  ['income','#view-incomes .page-head','Income','Your plan for money coming in, including recurring pay and one-time income.','Keep amounts and schedules current so the forecast knows when money is expected to arrive.'],
  ['forecast-settings','#v5SettingsCard','Forecast settings','Controls the assumptions used by Safe to spend and the adaptive forecast.','Emergency cushion changes the reserve. Large bill threshold defines a major cost. Forecast learning can be turned on or off.'],
  ['accounts','#accountsList','Accounts','The balances that form your current net balance.','Use Update balances for normal check-ins. Add or edit an account only when its structure changes.','.settings-card'],
  ['category-settings','#categoriesList','Categories','Groups planned income and spending so summaries are easier to understand.','Use broad categories that are meaningful to you. A category changes reporting, not the amount or date.','.settings-card'],
  ['appearance','#themeSelect','Appearance','Changes how Finance Planner looks in this browser.','Light and dark mode do not affect financial data or calculations.','.settings-card'],
  ['backup','#exportData','Backup and restore','Exports your Finance Planner data to a JSON file that can be imported later.','Export after meaningful plan or history changes, and before clearing browser data or changing devices.','.settings-card'],
  ['local-data','#resetData','Local data','Finance Planner stores its working data in this browser.','Reset permanently clears the planner from this browser. Export a backup first if you may want the data again.','.settings-card']
].map(([id,selector,title,summary,use,relationship]) => ({ id, selector, title, summary, use, relationship }));

function resolveTarget(item) {
  const node = $(item.selector);
  if (!node) return null;
  if (!item.relationship) return node;
  if (item.relationship.startsWith('.')) return node.closest(item.relationship);
  if (item.relationship.startsWith('previous:')) {
    const selector = item.relationship.slice(9);
    let current = node.previousElementSibling;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.previousElementSibling;
    }
  }
  return node;
}

function helpAnchor(target) {
  if (!target) return null;
  if (target.matches('.page-head')) return target.querySelector('h1');
  return target.querySelector('.v51-adaptive-headline,.card-head h2,.section-head h2,.settings-title h2,h2,.hero-label,.card-kicker,.kpi-label,.v5-label') || target.firstElementChild;
}

function ensureDialog() {
  if (dialog?.isConnected) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'v52HelpDialog';
  dialog.className = 'v52-help-dialog';
  dialog.innerHTML = `<div class="v52-help-head"><div><div class="v52-help-eyebrow">How this works</div><h2 id="v52HelpTitle"></h2></div><button class="v52-help-close" type="button" aria-label="Close help">×</button></div><div class="v52-help-body"><p id="v52HelpSummary"></p><div class="v52-help-use"><strong>How to use it</strong><p id="v52HelpUse"></p></div></div>`;
  dialog.querySelector('.v52-help-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  return dialog;
}

function openHelp(id) {
  const item = HELP.find(entry => entry.id === id);
  if (!item) return;
  const modal = ensureDialog();
  setText('#v52HelpTitle', item.title, modal);
  setText('#v52HelpSummary', item.summary, modal);
  setText('#v52HelpUse', item.use, modal);
  if (!modal.open) modal.showModal();
}

function addHelp() {
  HELP.forEach(item => {
    const anchor = helpAnchor(resolveTarget(item));
    if (!anchor || anchor.querySelector(`:scope > .v52-info-button[data-help-id="${item.id}"]`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v52-info-button';
    button.dataset.helpId = item.id;
    button.setAttribute('aria-label', `About ${item.title}`);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'v52HelpDialog');
    button.textContent = 'i';
    anchor.append(document.createTextNode(' '), button);
  });
}

function apply() {
  queued = false;
  ensureStyles();
  cleanPages();
  cleanDynamic();
  addHelp();
  setText('#brandVersion', `v${VERSION}`);
  setText('#appVersion', VERSION);
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

document.addEventListener('click', event => {
  const info = event.target.closest('.v52-info-button');
  if (info) {
    event.preventDefault();
    event.stopPropagation();
    openHelp(info.dataset.helpId);
    return;
  }
  if (event.target.closest('[data-view],[data-view-jump],#calendarPrev,#calendarNext,#calendarToday')) schedule();
});

const content = $('.content');
if (content) new MutationObserver(mutations => {
  if (mutations.some(mutation => mutation.type === 'childList')) schedule();
}).observe(content, { childList: true, subtree: true });

window.addEventListener('load', schedule, { once: true });
schedule();
