import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AI_MODES, MAX_PROMPT_CHARS, buildChatGPTUrl, buildPrompt, cleanText, modeQuestion } from '../js/v54-ai-core.js';

const ai = await readFile(new URL('../js/v54-chatgpt.js', import.meta.url), 'utf8');
const core = await readFile(new URL('../js/v54-ai-core.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/v54-chatgpt.css', import.meta.url), 'utf8');
const layout = await readFile(new URL('../js/layout-fix.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const privacy = await readFile(new URL('../privacy.html', import.meta.url), 'utf8');
const terms = await readFile(new URL('../terms.html', import.meta.url), 'utf8');
const constants = await readFile(new URL('../js/constants.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('ChatGPT deep link safely carries the prepared prompt in q', () => {
  const prompt = buildPrompt({ title: 'Test', question: 'Explain this', contextLines: ['Balance: $10,000', 'Spending: $2,000'] });
  const url = new URL(buildChatGPTUrl(prompt));
  assert.equal(url.origin, 'https://chatgpt.com');
  assert.equal(url.searchParams.get('q'), prompt);
  assert.ok(prompt.length <= MAX_PROMPT_CHARS);
});

test('prompt builder normalizes text and caps browser-link payload size', () => {
  assert.equal(cleanText('  hello\n\tworld  '), 'hello world');
  const prompt = buildPrompt({ title: 'Long', question: 'Analyze', contextLines: Array.from({ length: 100 }, (_, index) => `row ${index} ${'x'.repeat(300)}`) });
  assert.ok(prompt.length <= MAX_PROMPT_CHARS);
  assert.match(prompt, /plain English/i);
  assert.match(prompt, /Do not invent transactions/i);
  assert.match(prompt, /not individualized professional financial advice/i);
});

test('analysis modes include synopsis, explanation, analysis, next steps, and custom questions', () => {
  for (const mode of ['summary', 'explain', 'analyze', 'actions']) assert.ok(AI_MODES[mode]);
  assert.equal(modeQuestion('custom', 'Why did this change?'), 'Why did this change?');
  assert.equal(modeQuestion('summary'), AI_MODES.summary);
  assert.match(ai, /Synopsis/);
  assert.match(ai, />Explain</);
  assert.match(ai, />Analyze</);
  assert.match(ai, />Next steps</);
  assert.match(ai, /v54AiQuestion/);
});

test('Ask ChatGPT is fully client-side without an OpenAI API key or backend call', () => {
  assert.match(core, /https:\/\/chatgpt\.com\//);
  assert.doesNotMatch(ai + core, /api\.openai\.com/i);
  assert.doesNotMatch(ai + core, /OPENAI_API_KEY|sk-[A-Za-z0-9]/i);
  assert.doesNotMatch(ai, /JSON\.stringify\(store\.data/);
  assert.doesNotMatch(ai, /localStorage\.getItem|sessionStorage\.getItem/);
});

test('every Finance Planner tab gets a page-level ChatGPT action', () => {
  for (const [view, action] of [
    ['overview', 'dashboard'], ['calendar', 'calendar'], ['plan', 'plan'], ['insights', 'insights'],
    ['expenses', 'expenses'], ['incomes', 'incomes'], ['settings', 'settings']
  ]) {
    assert.match(ai, new RegExp(`addPageButton\\('${view}', '${action}'\\)`));
  }
  assert.match(ai, /Ask ChatGPT/);
  assert.match(css, /\.v54-page-ai/);
});

test('major cards and graphs get focused section-level AI actions', () => {
  for (const marker of ['#v5AdaptiveCard', '#v5PurchaseCard', '#radarMini', '#categoryOverview', '#goalsGrid', '#fundsGrid', '#v5HistorySection', '#v51CategoryExplorer', '#v5OptimizationSection']) {
    assert.match(ai, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const action of ['adaptive','purchase','watch','categories','calendar','goals','funds','scenario','history','expenses']) {
    assert.match(ai, new RegExp(`'${action}'`));
  }
  assert.match(css, /\.v54-ai-icon/);
});

test('AI prompt contexts use derived planner calculations rather than raw backup JSON', () => {
  for (const fn of ['adaptiveForecast','forecastLearning','safeToSpend','futureObligations','balanceTrend','financialHealth','goalOutlook','purchaseImpact','recurringMonthlyExpenses','recurringMonthlyIncome','goalMetrics','fundMetrics','next12Months']) {
    assert.match(ai, new RegExp(fn));
  }
  assert.match(ai, /Information that will be shared/);
  assert.match(ai, /Finance Planner does not send the full JSON/);
  assert.match(ai, /Copy prompt/);
  assert.match(ai, /Open in ChatGPT/);
});

test('no ChatGPT data is transmitted until the user activates the outbound action', () => {
  assert.match(ai, /Nothing is sent until you choose Open in ChatGPT/);
  assert.match(ai, /addEventListener\('click', openChatGPT\)/);
  assert.match(ai, /window\.open\(url, '_blank'/);
  assert.doesNotMatch(ai, /fetch\([^\n]*chatgpt/i);
  assert.doesNotMatch(ai, /sendBeacon/i);
});

test('privacy and terms disclose ChatGPT prompt sharing and browser-history implications', () => {
  assert.match(privacy, /Ask ChatGPT/);
  assert.match(privacy, /browser history/i);
  assert.match(privacy, /does not send the full Finance Planner JSON/i);
  assert.match(privacy, /Nothing is sent to ChatGPT merely because the page loads/i);
  assert.match(terms, /Ask ChatGPT integration/);
  assert.match(terms, /AI responses may misunderstand/i);
  assert.match(terms, /ChatGPT behavior/i);
});

test('V5.4 release metadata and cache busting are aligned', () => {
  assert.equal(pkg.version, '5.4.0');
  assert.match(constants, /APP_VERSION = '5\.4\.0'/);
  assert.match(layout, /DISPLAY_VERSION = '5\.4\.0'/);
  assert.match(layout, /v54-chatgpt\.js\?v=5\.4\.0/);
  assert.match(html, /brandVersion">v5\.4\.0/);
  assert.match(html, /appVersion">5\.4\.0/);
  assert.match(html, /layout-fix\.js\?v=5\.4\.0/);
  assert.match(html, /app\.js\?v=5\.4\.0/);
});
