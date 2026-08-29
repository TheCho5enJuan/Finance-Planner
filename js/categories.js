export const DEFAULT_CATEGORIES = [
  { id: 'housing', name: 'Housing', kind: 'expense' },
  { id: 'utilities', name: 'Utilities', kind: 'expense' },
  { id: 'groceries', name: 'Groceries', kind: 'expense' },
  { id: 'entertainment', name: 'Entertainment & Dining', kind: 'expense' },
  { id: 'shopping', name: 'Shopping', kind: 'expense' },
  { id: 'transportation', name: 'Transportation', kind: 'expense' },
  { id: 'insurance', name: 'Insurance', kind: 'expense' },
  { id: 'education', name: 'Education', kind: 'expense' },
  { id: 'subscriptions', name: 'Subscriptions', kind: 'expense' },
  { id: 'family', name: 'Family', kind: 'expense' },
  { id: 'donations', name: 'Donations', kind: 'expense' },
  { id: 'travel', name: 'Travel', kind: 'expense' },
  { id: 'taxes', name: 'Taxes', kind: 'expense' },
  { id: 'healthcare', name: 'Healthcare', kind: 'expense' },
  { id: 'income', name: 'Income', kind: 'income' },
  { id: 'other', name: 'Other', kind: 'both' }
];

const RULES = [
  ['education', /\b(tuition|enrollment|providence college|msba|school fee|college|university|mch)\b/i],
  ['donations', /\b(donations?|giving|charity|church)\b/i],
  ['insurance', /\b(progressive|insurance|geico|allstate|liberty mutual)\b/i],
  ['subscriptions', /\b(netflix|hulu|disney\+?|youtube( tv)?|spotify|apple music|prime video|max|paramount)\b/i],
  ['utilities', /\b(utility|sewer|water|electric|gas bill|verizon|t-mobile|internet|cox|xfinity)\b/i],
  ['groceries', /\b(grocery|groceries|market basket|stop & shop|aldi|whole foods)\b/i],
  ['transportation', /\b(honda|mazda|toyota|car gas|gasoline|fuel|auto loan|car payment|vehicle)\b/i],
  ['taxes', /\b(property tax|taxes|irs|revenue)\b/i],
  ['travel', /\b(trip|flight|airfare|hotel|airbnb|vacation|bolivia|travel)\b/i],
  ['family', /\b(birthday|family|child|kids|daycare|babysit|ortega)\b/i],
  ['entertainment', /\b(zoo|museum|fun|restaurant|dining|movies?|entertainment)\b/i],
  ['shopping', /\b(shopping|amazon|target|walmart|clothing|clothes)\b/i],
  ['housing', /\b(mortgage|rent|hoa|home repair|house repair)\b/i],
  ['healthcare', /\b(doctor|medical|dental|vision|pharmacy|hospital|health)\b/i]
];

export function categoryIdSet(categories = []) { return new Set(categories.map(category => category.id)); }
export function suggestCategory(description, type = 'expense') {
  if (type === 'income' || type === 'incomes') return 'income';
  const text = String(description || '');
  for (const [id, pattern] of RULES) if (pattern.test(text)) return id;
  return 'other';
}
export function categoryName(data, id) { return data?.categories?.find(category => category.id === id)?.name || DEFAULT_CATEGORIES.find(category => category.id === id)?.name || 'Other'; }
export function ensureCategories(existing = []) {
  const byId = new Map(DEFAULT_CATEGORIES.map(category => [category.id, { ...category }]));
  for (const category of existing) {
    if (!category?.id) continue;
    byId.set(String(category.id), { id: String(category.id), name: String(category.name || category.id), kind: ['expense', 'income', 'both'].includes(category.kind) ? category.kind : 'both' });
  }
  return [...byId.values()];
}
export function categoryTotals(events = []) {
  const totals = new Map();
  for (const event of events) {
    if (event.type !== 'expense') continue;
    const id = event.category || 'other';
    totals.set(id, (totals.get(id) || 0) + Math.abs(Number(event.amount || 0)));
  }
  return [...totals.entries()].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);
}
