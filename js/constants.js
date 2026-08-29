export const APP_VERSION = '4.0.0';
export const STORAGE_KEY = 'planner_v2';
export const STORAGE_BACKUP_KEY = 'planner_v2_backup';
export const MAX_OCCURRENCES = 20000;
export const ALLOWED_FREQUENCIES = new Set(['once', 'weekly', 'biweekly', 'monthly', 'yearly']);
export const RANGE_OPTIONS = [
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '12M', days: 365 },
  { label: '24M', days: 730 },
  { label: '5Y', days: 1826 }
];
export const LARGE_EXPENSE_THRESHOLD = 1000;
export const DEFAULT_TRACKING_WINDOW_DAYS = 365;
