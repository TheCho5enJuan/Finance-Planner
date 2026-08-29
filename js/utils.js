import { ALLOWED_FREQUENCIES } from './constants.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function money(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(n);
}

export function uuid() {
  return globalThis.crypto?.randomUUID?.() || `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function startOfDay(value = new Date()) {
  const d = value instanceof Date ? new Date(value) : parseISODate(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toISODateLocal(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseISODate(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return d.getFullYear() === Number(match[1]) && d.getMonth() === Number(match[2]) - 1 && d.getDate() === Number(match[3]) ? d : null;
}

export function todayISO() {
  return toISODateLocal(new Date());
}

export function addDays(value, days) {
  const d = startOfDay(value);
  if (!d) return null;
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

export function sanitizeFrequency(value) {
  const f = String(value || 'once').toLowerCase();
  return ALLOWED_FREQUENCIES.has(f) ? f : 'once';
}

export function sanitizeDescription(value) {
  const text = String(value || '').trim();
  return text || 'Untitled';
}

export function parseAmount(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function debounce(fn, delay = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
