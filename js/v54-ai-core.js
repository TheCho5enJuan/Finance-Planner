export const CHATGPT_BASE_URL = 'https://chatgpt.com/';
export const MAX_PROMPT_CHARS = 5600;

export const AI_MODES = Object.freeze({
  summary: 'Give me a short plain-English summary of what these numbers mean.',
  explain: 'Explain these numbers step by step for someone who does not follow finance closely.',
  analyze: 'Analyze the patterns, strengths, risks, and tradeoffs shown by these numbers.',
  actions: 'Based only on these numbers, give me the three most useful things to consider next.'
});

export function cleanText(value, max = 180) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function compactLines(lines = [], maxLines = 40) {
  return lines
    .map(line => cleanText(line, 240))
    .filter(Boolean)
    .slice(0, maxLines);
}

export function buildPrompt({ title, question, contextLines = [] }) {
  const safeTitle = cleanText(title || 'Finance Planner', 120);
  const safeQuestion = cleanText(question || AI_MODES.summary, 500);
  const context = compactLines(contextLines).map(line => `- ${line}`).join('\n');
  const prompt = [
    'I am using a personal Finance Planner. The planner has already calculated the values below.',
    'Do not replace the supplied calculations with guesses. If you do additional math, label it clearly as your own calculation.',
    '',
    `TOPIC: ${safeTitle}`,
    `QUESTION: ${safeQuestion}`,
    '',
    'FINANCE PLANNER CONTEXT',
    context || '- No additional numeric context is available.',
    '',
    'RESPONSE GUIDELINES',
    '- Use plain English for someone who does not follow finance closely.',
    '- Start with a concise synopsis.',
    '- Explain what looks positive and what deserves attention.',
    '- Give no more than three practical next steps when the data supports them.',
    '- Call out uncertainty, assumptions, and missing information.',
    '- Do not shame spending or assume that a large category is automatically bad.',
    '- Do not invent transactions, account balances, motives, debts, or income sources that are not listed.',
    '- Treat this as educational planning context, not individualized professional financial advice.'
  ].join('\n');

  if (prompt.length <= MAX_PROMPT_CHARS) return prompt;
  const fixed = prompt.slice(0, MAX_PROMPT_CHARS - 120);
  return `${fixed}\n\n[Finance Planner shortened this prompt to fit safely in a browser link.]`;
}

export function buildChatGPTUrl(prompt) {
  const url = new URL(CHATGPT_BASE_URL);
  url.searchParams.set('q', String(prompt || '').slice(0, MAX_PROMPT_CHARS));
  return url.toString();
}

export function modeQuestion(mode, customQuestion = '') {
  if (mode === 'custom' && cleanText(customQuestion, 500)) return cleanText(customQuestion, 500);
  return AI_MODES[mode] || AI_MODES.summary;
}
