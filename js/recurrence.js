import { MAX_OCCURRENCES } from './constants.js';
import { parseISODate, sanitizeFrequency, startOfDay } from './utils.js';

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addMonthsClamped(date, months, anchorDay) {
  const targetMonth = date.getMonth() + months;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  return new Date(targetYear, month, Math.min(anchorDay, daysInMonth(targetYear, month)));
}

function addYearsClamped(date, years, anchorMonth, anchorDay) {
  const year = date.getFullYear() + years;
  return new Date(year, anchorMonth, Math.min(anchorDay, daysInMonth(year, anchorMonth)));
}

export function nextOccurrence(date, frequency, anchor) {
  const d = startOfDay(date);
  const freq = sanitizeFrequency(frequency);
  if (freq === 'weekly') {
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (freq === 'biweekly') {
    d.setDate(d.getDate() + 14);
    return d;
  }
  if (freq === 'monthly') return addMonthsClamped(d, 1, anchor.day);
  if (freq === 'yearly') return addYearsClamped(d, 1, anchor.month, anchor.day);
  return null;
}

export function* occurrences(item, fromValue, toValue) {
  const start = parseISODate(item.date);
  const from = startOfDay(fromValue);
  const to = startOfDay(toValue);
  const end = item.endDate ? parseISODate(item.endDate) : null;
  if (!start || !from || !to || from > to || (end && start > end)) return;

  const frequency = sanitizeFrequency(item.frequency);
  const anchor = { day: start.getDate(), month: start.getMonth() };
  let current = startOfDay(start);
  let guard = 0;

  if (frequency === 'once') {
    if (current >= from && current <= to && (!end || current <= end)) yield current;
    return;
  }

  while (current < from && guard < MAX_OCCURRENCES) {
    current = nextOccurrence(current, frequency, anchor);
    guard += 1;
  }

  while (current && current <= to && (!end || current <= end) && guard < MAX_OCCURRENCES) {
    yield new Date(current);
    current = nextOccurrence(current, frequency, anchor);
    guard += 1;
  }
}
