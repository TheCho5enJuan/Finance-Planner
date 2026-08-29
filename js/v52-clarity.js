const VERSION = '5.2.0';

let scheduled = false;
let helpDialog = null;

function $(selector, root = document) { return root.querySelector(selector); }
function $$(selector, root = document) { return [...root.querySelectorAll(selector)]; }

function setText(selector, text, root = document) {
  const node = $(selector, root);
  if (node && node.textContent !== text) node.textContent = text;
}

function setChildText(containerSelector, childSelector, text) {
  const container = $(containerSelector);
  const node = container?.querySelector(childSelector);
  if (node && node.textContent !== text) node.textContent = text;
}

function setLabelFor(forId, text) {
  const label = document.querySelector(`label[for="${forId}"]`);
  if (label && label.textContent !== text) label.textContent = text;
}

function setCardLabel(valueId, text) {
  const value = document.getElementById(valueId);
  const label = value?.closest('.kpi-card,.v5-intel-card')?.querySelector('.kpi-label,.v5-label');
  if (label && label.childNodes.length === 1 && label.textContent !== text) label.textContent = text;
}

function cleanStaticCopy() {
  document.documentElement.dataset.financePlannerVersion = VERSION;
  document.title = `${document.querySelector('.view.active .eyebrow')?.textContent || 'Finance Planner'} · Finance Planner`;

  setText('#brandVersion', `v${VERSION}`);
  setText('#appVersion', VERSION);
  setText('.topbar-title', 'Finance Planner');
  setText('#topbarStatus', 'Your latest balances are the starting point for every forecast.');
  setText('.sidebar-foot', 'Stored in this browser. Export a backup to keep a copy.');

  setText('#view-overview .page-head h1', 'Your financial picture');
  setText('#view-overview .page-head .subtle', 'Update your account balances when they change. The planner combines those balances with your planned income and spending to show what may happen next.');
  setText('#view-overview .hero-label', 'Current net balance');
  setText('#view-overview .hero-caption', 'The total of the account balances you entered, including negative balances such as credit cards. Every forecast starts here.');
  setText('#view-overview .forecast-card .card-kicker', 'Planned ending balance');
  setText('#scenarioBadge', 'What-if scenario is on');
  setLabelFor('targetDate', 'Choose a specific end date');
  setCardLabel('income12', 'Expected income · 12 months');
  setCardLabel('expense12', 'Expected spending · 12 months');
  setCardLabel('net12', 'Planned balance change · 12 months');
  setCardLabel('cash30', 'Planned balance change · 30 days');
  setChildText('#view-overview .radar-card', 'h2', 'Things to watch');
  setChildText('#view-overview .radar-card', '.card-head p', 'Items that may need your attention based on the current plan.');
  setChildText('#view-overview .quick-card', '.card-head p', 'Add income or spending only when your plan changes.');
  setChildText('#view-overview .table-card', 'h2', 'Upcoming planned activity');
  const count = $('#upcomingCount');
  if (count && /occurrences/i.test(count.textContent)) count.textContent = count.textContent.replace(/occurrences?/i, 'items');

  setText('#view-calendar .page-head h1', 'Calendar');
  setText('#view-calendar .page-head .subtle', 'See which days money is expected to come in or go out. Select a day to see the items behind it.');
  setText('#calendarDayTitle', $('#calendarDayTitle')?.textContent === 'Selected day' ? 'Day details' : $('#calendarDayTitle')?.textContent || 'Day details');

  setText('#view-plan .page-head h1', 'Plan ahead');
  setText('#view-plan .page-head .subtle', 'Set goals, prepare for large future costs, and test changes before adding them to your real plan.');
  setChildText('#view-plan .section-head', 'p', 'Track a savings or balance target.');
  const planHeads = $$('#view-plan .section-head');
  if (planHeads[1]) {
    const p = planHeads[1].querySelector('p');
    if (p && p.textContent !== 'Set aside money for a known future bill or purchase.') p.textContent = 'Set aside money for a known future bill or purchase.';
  }
  setChildText('#view-plan .suggestions-card', '.card-head p', 'Large scheduled costs that may be easier to save for over time.');
  setChildText('#view-plan .scenario-card', '.card-head p', 'Test a temporary change without changing your saved income or expenses.');
  setLabelFor('scenarioIncome', 'Monthly income change');
  setLabelFor('scenarioExpense', 'Monthly spending change');
  setLabelFor('scenarioOneTime', 'One-time balance change (+/-)');
  setLabelFor('scenarioOneTimeDate', 'Date of one-time change');
  setText('#saveScenario', 'Apply scenario');

  setText('#view-insights .page-head h1', 'Insights');
  setText('#view-insights .page-head .subtle', 'See what your balance history and planned cash flow are telling you. Start with the summary, then open details when you need them.');

  setText('#view-expenses .eyebrow', 'Spending plan');
  setText('#view-expenses .page-head .subtle', 'Bills and spending you expect. Change an item when its amount, date, or schedule changes.');
  setText('#view-incomes .eyebrow', 'Income plan');
  setText('#view-incomes .page-head .subtle', 'Money you expect to receive. Change an item when its amount, date, or schedule changes.');

  setText('#view-settings .page-head h1', 'Settings');
  setText('#view-settings .page-head .subtle', 'Manage accounts, categories, forecast assumptions, backups, and display preferences.');
  const settingsCards = $$('#view-settings .settings-card');
  settingsCards.forEach(card => {
    const heading = card.querySelector('h2')?.textContent?.trim();
    if (heading === 'Accounts') setChildTextFrom(card, 'p', 'Your account balances are the source of truth. Use Update balances for normal check-ins; use Edit to rename or restructure an account.');
    if (heading === 'Categories') setChildTextFrom(card, 'p', 'Categories group planned spending so you can see where your money is going.');
    if (heading === 'Appearance') setChildTextFrom(card, 'p', 'Choose light or dark mode for this browser.');
    if (heading === 'Backup & restore') setChildTextFrom(card, 'p', 'Export a JSON backup so you can restore your plan later or move it to another browser.');
    if (heading === 'Local data') setChildTextFrom(card, 'p', 'Your financial data stays in this browser unless you export a backup.');
  });

  setChildText('#balanceDialog', '.dialog-body .subtle', 'Enter the balances you see today. This saves a new balance check-in and starts every forecast from the updated total.');
  const balanceTotalLabel = $('#balanceDialog .balance-inline span');
  if (balanceTotalLabel && balanceTotalLabel.textContent !== 'New total balance') balanceTotalLabel.textContent = 'New total balance';
  setLabelFor('goalSource', 'How progress is measured');
  setLabelFor('goalCurrent', 'Current amount (manual)');
  setLabelFor('fundReserved', 'Amount already saved');
  setLabelFor('fundAccount', 'Saved in account');
}

function setChildTextFrom(root, selector, text) {
  const node = root?.querySelector(selector);
  if (node && node.textContent !== text) node.textContent = text;
}

function cleanDynamicCopy() {
  $$('.v5-badge').forEach(node => { node.hidden = true; });

  setCardLabel('v5SafeSpend', 'Safe to spend');
  setCardLabel('v5Obligations', 'Large bills · 12 months');
  setCardLabel('v5Emergency', 'Emergency cushion');
  setCardLabel('v5Accuracy', 'Forecast accuracy');

  setChildText('#v5AdaptiveCard', 'h2', 'Adaptive forecast');
  const learningLabels = $$('#v5AdaptiveCard .v5-learning-row span');
  const adaptiveLabels = ['Typical spending not in your plan', 'Balance check-ins', 'Average monthly balance change'];
  learningLabels.forEach((node, index) => {
    if (adaptiveLabels[index] && node.textContent !== adaptiveLabels[index]) node.textContent = adaptiveLabels[index];
  });

  setChildText('#v5PurchaseCard', 'h2', 'Purchase check');
  setChildText('#v5PurchaseCard', '.card-head p', 'See how a purchase would affect your forecast without adding it to your plan.');
  const purchaseButton = $('#v5PurchaseForm button[type="submit"]');
  if (purchaseButton && purchaseButton.textContent !== 'Check purchase') purchaseButton.textContent = 'Check purchase';

  setChildText('#v5HealthSection', 'h2', 'Financial snapshot');
  setChildText('#v5HealthSection', '.section-head p', 'A quick check of cash, reserves, recurring costs, and forecast risk.');
  setChildText('#v5HistorySection .v5-history-card', 'h2', 'Balance over time');
  setChildText('#v5HistorySection .v5-history-card', '.card-head p', 'How your total account balance changed each time you used Update balances.');
  const historyLabels = $$('#v5HistorySection .v5-history-card .v5-learning-row span');
  const historyCopy = ['Average monthly balance change', 'Plan accuracy', 'Spending not in your plan'];
  historyLabels.forEach((node, index) => {
    if (historyCopy[index] && node.textContent !== historyCopy[index]) node.textContent = historyCopy[index];
  });
  setChildText('#v5HistorySection .v5-obligation-card', 'h2', 'Large upcoming bills');
  setChildText('#v5HistorySection .v5-obligation-card', '.card-head p', 'Large one-time or yearly costs scheduled in the next 12 months.');
  setChildText('#v5GoalOutlookSection', 'h2', 'Goal timing');
  setChildText('#v5GoalOutlookSection', '.card-head p', 'An estimate of when you may reach each goal if your recent balance trend continues.');
  setChildText('#v5OptimizationSection', 'h2', 'Recurring cost what-if');
  setChildText('#v5OptimizationSection', '.card-head p', 'Compare the five-year forecast with and without a recurring expense. Nothing is deleted.');

  setChildText('#v51CategoryExplorer', 'h2', 'Spending by category');
  setChildText('#v51CategoryExplorer', '.card-head p', 'Select a category to see how much it contributes and which planned items make up the total.');

  const planningSummary = $('#v51PlanningDisclosure summary strong');
  if (planningSummary && planningSummary.textContent !== 'Goals and large bills') planningSummary.textContent = 'Goals and large bills';
  const planningSmall = $('#v51PlanningDisclosure summary small');
  if (planningSmall && planningSmall.textContent !== 'Open when you want the detailed timing of goals and large upcoming costs.') planningSmall.textContent = 'Open when you want the detailed timing of goals and large upcoming costs.';
  const optimizerSummary = $('#v51OptimizationDisclosure summary strong');
  if (optimizerSummary && optimizerSummary.textContent !== 'Recurring cost what-if') optimizerSummary.textContent = 'Recurring cost what-if';
  const optimizerSmall = $('#v51OptimizationDisclosure summary small');
  if (optimizerSmall && optimizerSmall.textContent !== 'See how removing a recurring expense would change the five-year forecast.') optimizerSmall.textContent = 'See how removing a recurring expense would change the five-year forecast.';

  setChildText('#v5SettingsCard', 'h2', 'Forecast settings');
  setChildText('#v5SettingsCard', '.settings-title p', 'Choose how much emergency cushion to reserve and whether the forecast should learn from your balance history.');
  const adaptiveToggle = $('#v5AdaptiveToggle')?.closest('label');
  if (adaptiveToggle) {
    const input = $('#v5AdaptiveToggle');
    const checked = input?.checked;
    adaptiveToggle.replaceChildren();
    if (input) {
      input.checked = checked;
      adaptiveToggle.append(input, document.createTextNode(' Adjust forecasts using my balance history'));
    }
  }
  setLabelFor('v5EmergencyMonths', 'Emergency cushion');
  setLabelFor('v5MajorThreshold', 'Large bill threshold');
  setText('#v5ClearHistory', 'Clear forecast learning');
}

const HELP = [
  {
    id: 'current-balance', selector: '#view-overview .balance-hero', title: 'Current net balance',
    summary: 'This is the total of the account balances you entered. Positive accounts add to the total; negative accounts, such as a credit card balance, reduce it.',
    use: 'Update balances whenever the numbers in your real accounts have meaningfully changed. All forecasts start from this total.'
  },
  {
    id: 'planned-ending-balance', selector: '#view-overview .forecast-card', title: 'Planned ending balance',
    summary: 'This is what your balance would be at the selected future date if the income and expenses in your plan happen as scheduled.',
    use: 'Use 3M, 6M, 12M, 24M, 5Y, or a specific date to answer: “If my plan happens exactly as written, where would I end up?”'
  },
  {
    id: 'expected-income', selector: '#income12', closest: '.kpi-card', title: 'Expected income',
    summary: 'The total income currently scheduled in your plan for the next 12 months.',
    use: 'If this looks wrong, review the Income tab for an incorrect amount, date, or frequency.'
  },
  {
    id: 'expected-spending', selector: '#expense12', closest: '.kpi-card', title: 'Expected spending',
    summary: 'The total planned expenses scheduled for the next 12 months. It includes recurring and one-time items.',
    use: 'Use this as a planning total, not a record of what you actually spent.'
  },
  {
    id: 'planned-change-year', selector: '#net12', closest: '.kpi-card', title: 'Planned balance change',
    summary: 'Expected income minus expected spending for the next 12 months.',
    use: 'A positive number means the written plan adds to your balance. A negative number means the written plan uses more money than it brings in.'
  },
  {
    id: 'planned-change-month', selector: '#cash30', closest: '.kpi-card', title: '30-day planned change',
    summary: 'Expected income minus expected spending over the next 30 days.',
    use: 'Use this for the near-term picture. It can be negative during a month with a large bill even when the longer-term plan is healthy.'
  },
  {
    id: 'adaptive-forecast', selector: '#v5AdaptiveCard', title: 'Adaptive forecast',
    summary: 'The adaptive forecast starts with your written plan, then adjusts it using the difference between past expected balances and the balances you actually entered.',
    use: 'The dashed line is the original plan. The adaptive line is the adjusted estimate. The shaded range shows uncertainty. It follows the same time-range buttons as the dashboard.'
  },
  {
    id: 'safe-spend', selector: '#v5SafeSpend', closest: '.v5-intel-card', title: 'Safe to spend',
    summary: 'A conservative estimate of money left after reserving for large scheduled bills and your chosen emergency cushion.',
    use: 'Treat this as a planning guardrail, not permission to spend every dollar shown. Changing the emergency-cushion setting changes this number.'
  },
  {
    id: 'large-bills', selector: '#v5Obligations', closest: '.v5-intel-card', title: 'Large bills',
    summary: 'The total of one-time and yearly expenses above your “large bill” threshold that are scheduled in the next 12 months.',
    use: 'Use it to see how much of your current balance may already be spoken for by known large costs.'
  },
  {
    id: 'emergency-cushion', selector: '#v5Emergency', closest: '.v5-intel-card', title: 'Emergency cushion',
    summary: 'Recurring monthly expenses multiplied by the number of months you chose in Forecast settings.',
    use: 'This is a planning reserve. It does not move money into a separate account.'
  },
  {
    id: 'forecast-accuracy', selector: '#v5Accuracy', closest: '.v5-intel-card', title: 'Forecast accuracy',
    summary: 'How closely past balance check-ins matched what the plan expected at those dates.',
    use: 'More balance check-ins make this more useful. A lower percentage usually means actual life differed from the written plan.'
  },
  {
    id: 'spending-mix', selector: '#categoryOverview', closest: '.category-card', title: 'Where your money goes',
    summary: 'Planned expenses grouped by category for the next 12 months.',
    use: 'Use this to spot which categories take the largest share of the plan. Open Insights for item-level category details.'
  },
  {
    id: 'radar', selector: '#radarMini', closest: '.radar-card', title: 'Things to watch',
    summary: 'A short list of conditions in the plan that may deserve attention, such as tight cash flow or a large upcoming cost.',
    use: 'These are prompts to review the plan, not warnings that something is definitely wrong.'
  },
  {
    id: 'purchase-check', selector: '#v5PurchaseCard', title: 'Purchase check',
    summary: 'Tests a purchase against the current forecast without adding the purchase to your saved plan.',
    use: 'Enter an amount and date to see the estimated effect. If you actually decide to make it part of the plan, add it separately as an expense.'
  },
  {
    id: 'quick-add', selector: '#view-overview .quick-card', title: 'Quick add',
    summary: 'A shortcut for adding a new planned income or expense.',
    use: 'Use it when the plan itself changes. You do not need to enter every real purchase or bank transaction.'
  },
  {
    id: 'upcoming-activity', selector: '#view-overview .table-card', title: 'Upcoming planned activity',
    summary: 'A date-by-date list of the income and expenses created by your recurring and one-time plan items.',
    use: 'Search this table when you want to understand why the forecast rises or falls around a particular date.'
  },
  {
    id: 'calendar', selector: '#view-calendar .calendar-card', title: 'Calendar',
    summary: 'Shows when planned income and expenses are expected to occur during the month.',
    use: 'Select a day to see its items. Green and red markers show days with planned income and spending.'
  },
  {
    id: 'calendar-summary', selector: '#v51CalendarSummary', title: 'Monthly calendar summary',
    summary: 'Adds up the planned income, spending, net change, and number of scheduled items in the month you are viewing.',
    use: 'Use it to compare a heavy-expense month with a more typical month without changing your main forecast range.'
  },
  {
    id: 'goals', selector: '#goalsGrid', closestPrevious: '.section-head', title: 'Goals',
    summary: 'A goal is a target amount you want to reach, using total cash, one account, or a number you update manually.',
    use: 'Choose the progress source that matches the goal. The Insights tab can estimate timing when enough balance history exists.'
  },
  {
    id: 'sinking-funds', selector: '#fundsGrid', closestPrevious: '.section-head', title: 'Sinking funds',
    summary: 'A sinking fund is a plan to gradually set money aside for a known future cost.',
    use: 'For example, a yearly insurance bill can be easier to plan for as a monthly savings target. This feature does not move money between bank accounts.'
  },
  {
    id: 'suggested-funds', selector: '#view-plan .suggestions-card', title: 'Suggested funds',
    summary: 'The planner looks for large one-time or yearly expenses that may be worth saving toward gradually.',
    use: 'A suggestion is optional. Create a fund only when you want to track a separate savings target for that cost.'
  },
  {
    id: 'what-if', selector: '#view-plan .scenario-card', title: 'What-if scenario',
    summary: 'A temporary alternate version of the future that sits on top of your real plan.',
    use: 'Use it to test questions such as a raise, new monthly bill, or one-time purchase. Turning it off returns the forecast to the saved plan.'
  },
  {
    id: 'financial-snapshot', selector: '#v5HealthSection', title: 'Financial snapshot',
    summary: 'A group of simple checks covering available cash, planned cash flow, emergency cushion, recurring-cost load, large bills, and forecast risk.',
    use: 'Read the individual cards as signals. There is no hidden overall score.'
  },
  {
    id: 'balance-history', selector: '#v5HistorySection .v5-history-card', title: 'Balance over time',
    summary: 'Each time you use Update balances, the total becomes another point on this graph.',
    use: 'Hover with a mouse or press and drag on the graph to see values. The trend helps the adaptive forecast learn how reality differs from the written plan.'
  },
  {
    id: 'category-details', selector: '#v51CategoryExplorer', title: 'Spending by category',
    summary: 'Breaks the next 12 months of planned spending into categories and shows the items inside each category.',
    use: 'Select a category card to update the detail panel below it. “Recurring” is repeating spending; “one-time” is spending scheduled once.'
  },
  {
    id: 'planning-details', selector: '#v51PlanningDisclosure', title: 'Goals and large bills',
    summary: 'A deeper view of goal timing and large scheduled costs.',
    use: 'Keep it collapsed for a cleaner Insights page and open it when you need the detailed dates and amounts.'
  },
  {
    id: 'recurring-optimizer', selector: '#v51OptimizationDisclosure', title: 'Recurring cost what-if',
    summary: 'Shows how the five-year forecast changes if one recurring expense is removed from a temporary comparison.',
    use: 'It does not delete the real expense. Use Compare to understand long-term impact before deciding whether to change your plan.'
  },
  {
    id: 'expenses', selector: '#view-expenses .page-head', title: 'Expenses',
    summary: 'This is your plan for money going out: bills, regular spending allowances, and one-time costs.',
    use: 'Update an expense when the amount, schedule, or date changes. You do not need to enter every real-world purchase.'
  },
  {
    id: 'income', selector: '#view-incomes .page-head', title: 'Income',
    summary: 'This is your plan for money coming in, including recurring pay and one-time income.',
    use: 'Keep the amount and schedule current so the forecast knows when money is expected to arrive.'
  },
  {
    id: 'forecast-settings', selector: '#v5SettingsCard', title: 'Forecast settings',
    summary: 'Controls the assumptions used by Safe to spend and the adaptive forecast.',
    use: 'Emergency cushion changes the amount reserved for recurring costs. Large bill threshold decides which one-time/yearly costs count as major. Forecast learning can be turned on or off.'
  },
  {
    id: 'accounts', selector: '#accountsList', closest: '.settings-card', title: 'Accounts',
    summary: 'Accounts hold the balances that form your current net balance.',
    use: 'Use Update balances for normal check-ins. Use Add/Edit account only when you need to change the account structure itself.'
  },
  {
    id: 'categories-settings', selector: '#categoriesList', closest: '.settings-card', title: 'Categories',
    summary: 'Categories group planned income and expenses so summaries are easier to understand.',
    use: 'Use broad categories that are meaningful to you. Changing a category changes reporting, not the amount or date of the transaction.'
  },
  {
    id: 'appearance', selector: '#themeSelect', closest: '.settings-card', title: 'Appearance',
    summary: 'Changes how Finance Planner looks in this browser.',
    use: 'Light and dark mode do not affect your financial data or calculations.'
  },
  {
    id: 'backup', selector: '#exportData', closest: '.settings-card', title: 'Backup and restore',
    summary: 'Exports your Finance Planner data to a JSON file that can be imported later.',
    use: 'Export a backup after meaningful plan changes or balance-history updates, especially before clearing browser data or changing devices.'
  },
  {
    id: 'local-data', selector: '#resetData', closest: '.settings-card', title: 'Local data',
    summary: 'Finance Planner stores its working data in this browser.',
    use: 'Reset local data permanently clears the planner from this browser. Export a backup first if you may want the data again.'
  }
];

function resolveTarget(item) {
  const node = $(item.selector);
  if (!node) return null;
  if (item.closest) return node.closest(item.closest);
  if (item.closestPrevious) {
    let previous = node.previousElementSibling;
    while (previous) {
      if (previous.matches(item.closestPrevious)) return previous;
      previous = previous.previousElementSibling;
    }
  }
  return node;
}

function helpAnchor(target) {
  if (!target) return null;
  if (target.matches('.page-head')) return target.querySelector('h1');
  return target.querySelector('.card-head h2,.section-head h2,.settings-title h2,h2,.hero-label,.card-kicker,.kpi-label,.v5-label') || target.firstElementChild;
}

function ensureHelpDialog() {
  if (helpDialog?.isConnected) return helpDialog;
  helpDialog = document.createElement('dialog');
  helpDialog.id = 'v52HelpDialog';
  helpDialog.className = 'v52-help-dialog';
  helpDialog.innerHTML = `
    <div class="v52-help-head">
      <div><div class="v52-help-eyebrow">How this works</div><h2 id="v52HelpTitle"></h2></div>
      <button class="v52-help-close" type="button" aria-label="Close help">×</button>
    </div>
    <div class="v52-help-body">
      <p id="v52HelpSummary"></p>
      <div class="v52-help-use"><strong>How to use it</strong><p id="v52HelpUse"></p></div>
    </div>`;
  helpDialog.querySelector('.v52-help-close').addEventListener('click', () => helpDialog.close());
  helpDialog.addEventListener('click', event => {
    if (event.target === helpDialog) helpDialog.close();
  });
  document.body.append(helpDialog);
  return helpDialog;
}

function openHelp(id) {
  const item = HELP.find(row => row.id === id);
  if (!item) return;
  const dialog = ensureHelpDialog();
  setText('#v52HelpTitle', item.title, dialog);
  setText('#v52HelpSummary', item.summary, dialog);
  setText('#v52HelpUse', item.use, dialog);
  if (!dialog.open) dialog.showModal();
}

function decorateHelp() {
  HELP.forEach(item => {
    const target = resolveTarget(item);
    if (!target) return;
    const anchor = helpAnchor(target);
    if (!anchor) return;
    if (anchor.querySelector(`.v52-info-button[data-help-id="${item.id}"]`)) return;
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

function syncVersion() {
  setText('#brandVersion', `v${VERSION}`);
  setText('#appVersion', VERSION);
}

function apply() {
  scheduled = false;
  cleanStaticCopy();
  cleanDynamicCopy();
  decorateHelp();
  syncVersion();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

document.addEventListener('click', event => {
  const helpButton = event.target.closest('.v52-info-button');
  if (helpButton) {
    event.preventDefault();
    event.stopPropagation();
    openHelp(helpButton.dataset.helpId);
    return;
  }
  if (event.target.closest('[data-view],[data-view-jump],#calendarPrev,#calendarNext,#calendarToday')) schedule();
});

const content = $('.content');
if (content) {
  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.type === 'childList' || mutation.type === 'characterData')) schedule();
  });
  observer.observe(content, { childList: true, subtree: true, characterData: true });
}

window.addEventListener('load', schedule, { once: true });
schedule();

export { HELP, VERSION };
