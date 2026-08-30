export const CLOUD_META_KEY = 'planner_v53_drive_meta';

export function classifySyncState({ localHash = '', remoteHash = '', lastSyncedHash = '' } = {}) {
  if (!remoteHash) return 'missing-remote';
  if (localHash && localHash === remoteHash) return 'in-sync';
  if (!lastSyncedHash) return 'unlinked-difference';

  const localChanged = localHash !== lastSyncedHash;
  const remoteChanged = remoteHash !== lastSyncedHash;

  if (localChanged && remoteChanged) return 'conflict';
  if (localChanged) return 'local-newer';
  if (remoteChanged) return 'remote-newer';
  return 'unknown';
}

export function readCloudMeta(storage = globalThis.localStorage) {
  const fallback = { autoBackup: true, lastSyncedHash: '', lastSyncedAt: '' };
  if (!storage?.getItem) return fallback;
  try {
    const raw = JSON.parse(storage.getItem(CLOUD_META_KEY) || '{}');
    return {
      autoBackup: raw.autoBackup !== false,
      lastSyncedHash: typeof raw.lastSyncedHash === 'string' ? raw.lastSyncedHash : '',
      lastSyncedAt: typeof raw.lastSyncedAt === 'string' ? raw.lastSyncedAt : ''
    };
  } catch {
    return fallback;
  }
}

export function writeCloudMeta(next, storage = globalThis.localStorage) {
  const clean = {
    autoBackup: next?.autoBackup !== false,
    lastSyncedHash: typeof next?.lastSyncedHash === 'string' ? next.lastSyncedHash : '',
    lastSyncedAt: typeof next?.lastSyncedAt === 'string' ? next.lastSyncedAt : ''
  };
  storage?.setItem?.(CLOUD_META_KEY, JSON.stringify(clean));
  return clean;
}

export function describeSyncState(state) {
  return ({
    'missing-remote': ['Connected', 'No Drive backup exists yet.'],
    'in-sync': ['Up to date', 'This browser matches the Google Drive backup.'],
    'local-newer': ['Changes waiting to save', 'This browser has changes that are not yet in Google Drive.'],
    'remote-newer': ['Newer Drive backup found', 'Google Drive has changes that are not in this browser.'],
    'conflict': ['Choose which copy to keep', 'Both this browser and Google Drive changed since the last successful backup.'],
    'unlinked-difference': ['Existing Drive backup found', 'The Drive backup is different from this browser. Choose which copy to keep.'],
    unknown: ['Review backup', 'The browser and Drive copies do not match.']
  })[state] || ['Review backup', 'The browser and Drive copies do not match.'];
}
