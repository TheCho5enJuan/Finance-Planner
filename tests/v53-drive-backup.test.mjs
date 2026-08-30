import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifySyncState, readCloudMeta, writeCloudMeta } from '../js/cloud-backup-core.js';

const drive = await readFile(new URL('../js/v53-drive.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../js/layout-fix.js', import.meta.url), 'utf8');
const constants = await readFile(new URL('../js/constants.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    values
  };
}

test('V5.3 uses only the narrow Drive file scope and configured OAuth client ID', () => {
  assert.match(drive, /631310159901-pn1q8vh8408u4nmjusaskq9hiac0lqha\.apps\.googleusercontent\.com/);
  assert.match(drive, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.doesNotMatch(drive, /auth\/drive['"`]/);
  assert.doesNotMatch(drive, /client_secret/i);
});

test('OAuth credentials are session-only and Drive file IDs are not persisted', () => {
  assert.match(drive, /let accessToken = ''/);
  assert.match(drive, /let remoteFile = null/);
  assert.doesNotMatch(drive, /localStorage\.setItem\([^\n]*(accessToken|fileId|remoteFile|refreshToken)/i);
  assert.doesNotMatch(drive, /sessionStorage\.setItem\([^\n]*(accessToken|fileId|remoteFile|refreshToken)/i);
});

test('Drive backup is rediscovered using appProperties instead of a stored file ID', () => {
  assert.match(drive, /financePlannerRole/);
  assert.match(drive, /appProperties has \{ key=/);
  assert.match(drive, /primary-backup/);
  assert.match(drive, /backup-folder/);
  assert.match(drive, /findBackup\(\)/);
});

test('sync-state classifier prevents silent overwrite conflicts', () => {
  assert.equal(classifySyncState({ localHash: 'a', remoteHash: '', lastSyncedHash: '' }), 'missing-remote');
  assert.equal(classifySyncState({ localHash: 'a', remoteHash: 'a', lastSyncedHash: '' }), 'in-sync');
  assert.equal(classifySyncState({ localHash: 'b', remoteHash: 'a', lastSyncedHash: 'a' }), 'local-newer');
  assert.equal(classifySyncState({ localHash: 'a', remoteHash: 'b', lastSyncedHash: 'a' }), 'remote-newer');
  assert.equal(classifySyncState({ localHash: 'b', remoteHash: 'c', lastSyncedHash: 'a' }), 'conflict');
  assert.equal(classifySyncState({ localHash: 'a', remoteHash: 'b', lastSyncedHash: '' }), 'unlinked-difference');
  assert.match(drive, /Nothing will be overwritten until you choose which copy to keep/);
  assert.match(drive, /Use Drive backup/);
  assert.match(drive, /Use this browser/);
});

test('only harmless cloud sync metadata is persisted locally', () => {
  const storage = memoryStorage();
  const saved = writeCloudMeta({ autoBackup: false, lastSyncedHash: 'abc', lastSyncedAt: '2026-08-30T12:00:00.000Z', fileId: 'should-not-save', accessToken: 'secret' }, storage);
  assert.deepEqual(saved, { autoBackup: false, lastSyncedHash: 'abc', lastSyncedAt: '2026-08-30T12:00:00.000Z' });
  assert.deepEqual(readCloudMeta(storage), saved);
  const raw = [...storage.values.values()].join(' ');
  assert.doesNotMatch(raw, /should-not-save|secret/);
});

test('Google Identity Services loads only when the user connects', () => {
  assert.match(drive, /function loadGoogleIdentity\(\)/);
  assert.match(drive, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(drive, /requestAccessToken\('consent'\)/);
});

test('Drive card supports connect, save, restore, refresh, disconnect, auto backup, help, and conflict choices', () => {
  for (const id of ['driveConnect','driveSave','driveRestore','driveRefresh','driveDisconnect','driveAutoBackup','driveHelpButton','driveUseRemote','driveUseLocal']) {
    assert.match(drive, new RegExp(id));
  }
  assert.match(drive, /store\.subscribe/);
  assert.match(drive, /scheduleAutoBackup/);
  assert.match(drive, /window\.confirm\('Restore the Google Drive backup/);
  assert.match(drive, /showModal\(\)/);
});

test('V5.3 version metadata is consistent in core modules', () => {
  assert.match(constants, /APP_VERSION = '5\.3\.0'/);
  assert.match(layout, /v53-drive\.js\?v=5\.3\.0/);
  assert.match(layout, /DISPLAY_VERSION = '5\.3\.0'/);
  assert.equal(pkg.version, '5.3.0');
  assert.match(pkg.scripts.test, /v53-drive\.js/);
  assert.match(pkg.scripts.test, /cloud-backup-core\.js/);
});
