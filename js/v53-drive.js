import { APP_VERSION } from './constants.js';
import { store } from './store.js';
import { classifySyncState, describeSyncState, readCloudMeta, writeCloudMeta } from './cloud-backup-core.js';

export const GOOGLE_CLIENT_ID = '631310159901-pn1q8vh8408u4nmjusaskq9hiac0lqha.apps.googleusercontent.com';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Finance Planner';
const BACKUP_FILE_NAME = 'finance-planner-backup.json';
const APP_PROPERTY = 'financePlannerRole';
const ROLE_FOLDER = 'backup-folder';
const ROLE_BACKUP = 'primary-backup';

let tokenClient = null;
let accessToken = '';
let tokenExpiresAt = 0;
let tokenRequest = null;
let remoteFile = null;
let currentSyncState = 'disconnected';
let busy = false;
let suppressAutoBackup = false;
let autoTimer = 0;
let meta = readCloudMeta();

const $ = selector => document.querySelector(selector);

function ensureStyles() {
  if (document.getElementById('v53DriveStyles')) return;
  const link = document.createElement('link');
  link.id = 'v53DriveStyles';
  link.rel = 'stylesheet';
  link.href = './css/v53-drive.css?v=5.3.0';
  document.head.append(link);
}

function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  const existing = document.getElementById('googleIdentityServices');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google sign-in could not be loaded.')), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'googleIdentityServices';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google sign-in could not be loaded.'));
    document.head.append(script);
  });
}

async function requestAccessToken(prompt = 'consent') {
  if (accessToken && Date.now() < tokenExpiresAt - 30_000) return accessToken;
  await loadGoogleIdentity();
  if (tokenRequest) return tokenRequest;

  tokenRequest = new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: response => {
          const pending = tokenRequest;
          tokenRequest = null;
          if (response?.error || !response?.access_token) {
            accessToken = '';
            tokenExpiresAt = 0;
            pending?.reject?.(new Error(response?.error_description || response?.error || 'Google Drive authorization was not completed.'));
            return;
          }
          accessToken = response.access_token;
          tokenExpiresAt = Date.now() + (Number(response.expires_in || 3600) * 1000);
          pending?.resolve?.(accessToken);
        },
        error_callback: error => {
          const pending = tokenRequest;
          tokenRequest = null;
          pending?.reject?.(new Error(error?.message || 'Google Drive authorization was closed.'));
        }
      });
    }
    tokenClient.requestAccessToken({ prompt });
  });

  return tokenRequest;
}

function hasActiveToken() {
  return Boolean(accessToken && Date.now() < tokenExpiresAt - 30_000);
}

function clearToken() {
  accessToken = '';
  tokenExpiresAt = 0;
  remoteFile = null;
  currentSyncState = 'disconnected';
}

async function driveFetch(url, options = {}) {
  if (!hasActiveToken()) throw new Error('Reconnect Google Drive to continue.');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    clearToken();
    render();
    throw new Error('Your Google Drive session expired. Reconnect and try again.');
  }
  if (!response.ok) {
    let message = `Google Drive request failed (${response.status}).`;
    try {
      const detail = await response.json();
      message = detail?.error?.message || message;
    } catch { /* response was not JSON */ }
    throw new Error(message);
  }
  return response;
}

function queryUrl(query, fields = 'files(id,name,modifiedTime,createdTime,size,mimeType,appProperties,parents)') {
  const params = new URLSearchParams({ q: query, spaces: 'drive', orderBy: 'modifiedTime desc', pageSize: '20', fields });
  return `${DRIVE_API}/files?${params}`;
}

async function searchByRole(role, mimeType = '') {
  const clauses = [
    'trashed = false',
    `appProperties has { key='${APP_PROPERTY}' and value='${role}' }`
  ];
  if (mimeType) clauses.push(`mimeType = '${mimeType}'`);
  const response = await driveFetch(queryUrl(clauses.join(' and ')));
  const payload = await response.json();
  return payload.files || [];
}

async function getOrCreateFolder() {
  const mimeType = 'application/vnd.google-apps.folder';
  const existing = await searchByRole(ROLE_FOLDER, mimeType);
  if (existing[0]) return existing[0];

  const response = await driveFetch(`${DRIVE_API}/files?fields=id,name,modifiedTime,appProperties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType,
      appProperties: { [APP_PROPERTY]: ROLE_FOLDER, schema: '1' }
    })
  });
  return response.json();
}

async function findBackup() {
  const files = await searchByRole(ROLE_BACKUP, 'application/json');
  return files[0] || null;
}

async function sha256Text(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function localSnapshot() {
  const compact = JSON.stringify(store.data);
  return {
    compact,
    pretty: JSON.stringify(store.data, null, 2),
    hash: await sha256Text(compact)
  };
}

async function downloadRemote(file = remoteFile) {
  if (!file?.id) throw new Error('No Google Drive backup was found.');
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`);
  const text = await response.text();
  const data = JSON.parse(text);
  return { text, data, hash: await sha256Text(JSON.stringify(data)) };
}

async function resolveRemoteHash(file) {
  const stored = file?.appProperties?.contentHash;
  if (stored) return stored;
  return (await downloadRemote(file)).hash;
}

function multipartBody(metadata, content) {
  const boundary = `finance_planner_${crypto.randomUUID().replaceAll('-', '')}`;
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n`,
    `--${boundary}--`
  ].join('');
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

function backupMetadata(hash, parents) {
  const metadata = {
    name: BACKUP_FILE_NAME,
    mimeType: 'application/json',
    appProperties: {
      [APP_PROPERTY]: ROLE_BACKUP,
      schema: '1',
      plannerVersion: APP_VERSION,
      contentHash: hash,
      savedAt: new Date().toISOString()
    }
  };
  if (parents?.length) metadata.parents = parents;
  return metadata;
}

async function uploadSnapshot(snapshot, file = remoteFile) {
  let url;
  let method;
  let metadata;

  if (file?.id) {
    url = `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(file.id)}?uploadType=multipart&fields=id,name,modifiedTime,createdTime,size,mimeType,appProperties,parents`;
    method = 'PATCH';
    metadata = backupMetadata(snapshot.hash);
  } else {
    const folder = await getOrCreateFolder();
    url = `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime,createdTime,size,mimeType,appProperties,parents`;
    method = 'POST';
    metadata = backupMetadata(snapshot.hash, [folder.id]);
  }

  const multipart = multipartBody(metadata, snapshot.pretty);
  const response = await driveFetch(url, {
    method,
    headers: { 'Content-Type': multipart.contentType },
    body: multipart.body
  });
  return response.json();
}

function formatDriveTime(value) {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not saved yet' : date.toLocaleString();
}

function statusTone(state) {
  if (state === 'in-sync' || state === 'missing-remote') return 'connected';
  if (state === 'conflict' || state === 'remote-newer' || state === 'unlinked-difference') return 'warning';
  if (state === 'error') return 'error';
  return 'neutral';
}

function updateStatus(title, detail, state = currentSyncState) {
  const titleNode = $('#driveStatusTitle');
  const detailNode = $('#driveStatusDetail');
  const dot = $('#driveStatusDot');
  if (titleNode) titleNode.textContent = title;
  if (detailNode) detailNode.textContent = detail;
  if (dot) dot.dataset.state = statusTone(state);
}

function setBusy(next, message = '') {
  busy = next;
  for (const id of ['driveConnect','driveSave','driveRestore','driveRefresh','driveDisconnect','driveUseLocal','driveUseRemote']) {
    const button = document.getElementById(id);
    if (button) button.disabled = next;
  }
  if (message) updateStatus(message, 'Please wait…', currentSyncState);
}

function render() {
  const connected = hasActiveToken();
  const connect = $('#driveConnect');
  const save = $('#driveSave');
  const restore = $('#driveRestore');
  const refresh = $('#driveRefresh');
  const disconnect = $('#driveDisconnect');
  const conflict = $('#driveConflict');
  const modified = $('#driveBackupModified');
  const auto = $('#driveAutoBackup');

  if (connect) connect.hidden = connected;
  if (save) save.hidden = !connected;
  if (restore) restore.hidden = !connected || !remoteFile;
  if (refresh) refresh.hidden = !connected;
  if (disconnect) disconnect.hidden = !connected;
  if (auto) { auto.checked = meta.autoBackup !== false; auto.disabled = !connected || busy; }
  if (modified) modified.textContent = remoteFile ? formatDriveTime(remoteFile.modifiedTime) : 'Not saved yet';

  const needsChoice = connected && ['conflict','remote-newer','unlinked-difference'].includes(currentSyncState);
  if (conflict) conflict.hidden = !needsChoice;

  if (!connected) {
    updateStatus('Not connected', meta.lastSyncedAt ? `Last successful Drive backup: ${formatDriveTime(meta.lastSyncedAt)}. Reconnect to save or restore.` : 'Connect Google Drive to keep a second copy of your Finance Planner backup.', 'disconnected');
    return;
  }

  const [title, detail] = describeSyncState(currentSyncState);
  updateStatus(title, detail, currentSyncState);
}

async function inspectSyncState() {
  remoteFile = await findBackup();
  const local = await localSnapshot();
  const remoteHash = remoteFile ? await resolveRemoteHash(remoteFile) : '';
  currentSyncState = classifySyncState({ localHash: local.hash, remoteHash, lastSyncedHash: meta.lastSyncedHash });
  render();
  return { local, remoteHash, state: currentSyncState };
}

async function saveNow({ force = false, quiet = false } = {}) {
  if (!hasActiveToken()) await requestAccessToken('consent');
  if (busy) return false;
  setBusy(true, quiet ? '' : 'Checking Google Drive');
  try {
    const { local, state } = await inspectSyncState();
    if (!force && ['conflict','remote-newer','unlinked-difference'].includes(state)) {
      render();
      return false;
    }

    remoteFile = await uploadSnapshot(local, remoteFile);
    meta = writeCloudMeta({ ...meta, lastSyncedHash: local.hash, lastSyncedAt: new Date().toISOString() });
    currentSyncState = 'in-sync';
    render();
    return true;
  } catch (error) {
    console.error('Finance Planner Google Drive save failed.', error);
    currentSyncState = 'error';
    updateStatus('Drive backup failed', error.message, 'error');
    return false;
  } finally {
    setBusy(false);
    render();
  }
}

async function restoreFromDrive() {
  if (!hasActiveToken()) await requestAccessToken('consent');
  if (!remoteFile) remoteFile = await findBackup();
  if (!remoteFile) {
    updateStatus('No Drive backup found', 'Save this browser to Google Drive first.', 'warning');
    return false;
  }
  if (!window.confirm('Restore the Google Drive backup? This will replace the Finance Planner data currently stored in this browser.')) return false;

  setBusy(true, 'Restoring from Google Drive');
  try {
    const remote = await downloadRemote(remoteFile);
    suppressAutoBackup = true;
    store.import(remote.data);
    const local = await localSnapshot();
    meta = writeCloudMeta({ ...meta, lastSyncedHash: local.hash, lastSyncedAt: new Date().toISOString() });
    currentSyncState = 'in-sync';
    render();
    return true;
  } catch (error) {
    console.error('Finance Planner Google Drive restore failed.', error);
    currentSyncState = 'error';
    updateStatus('Restore failed', error.message, 'error');
    return false;
  } finally {
    suppressAutoBackup = false;
    setBusy(false);
    render();
  }
}

async function connectDrive() {
  if (busy) return;
  setBusy(true, 'Connecting to Google Drive');
  try {
    await requestAccessToken('consent');
    const result = await inspectSyncState();
    if (result.state === 'missing-remote') await saveNow({ force: true, quiet: true });
  } catch (error) {
    console.error('Finance Planner Google Drive connection failed.', error);
    currentSyncState = 'error';
    updateStatus('Could not connect', error.message, 'error');
  } finally {
    setBusy(false);
    render();
  }
}

async function refreshDrive() {
  if (!hasActiveToken()) await requestAccessToken('consent');
  setBusy(true, 'Checking Google Drive');
  try {
    await inspectSyncState();
  } catch (error) {
    currentSyncState = 'error';
    updateStatus('Could not check Drive', error.message, 'error');
  } finally {
    setBusy(false);
    render();
  }
}

function disconnectDrive() {
  const token = accessToken;
  clearToken();
  if (token && window.google?.accounts?.oauth2?.revoke) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  render();
}

function scheduleAutoBackup() {
  if (suppressAutoBackup || !meta.autoBackup || !hasActiveToken()) return;
  window.clearTimeout(autoTimer);
  autoTimer = window.setTimeout(() => saveNow({ quiet: true }), 1500);
}

function makeButton(id, text, className = 'button') {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
}

function buildCard() {
  if ($('#driveBackupCard')) return;
  const grid = $('#view-settings .settings-grid');
  if (!grid) return;

  const card = document.createElement('section');
  card.id = 'driveBackupCard';
  card.className = 'surface-card settings-card wide-card v53-drive-card';
  card.innerHTML = `
    <div class="v53-drive-head">
      <div><h2>Google Drive backup</h2><p>Keep a second copy of your Finance Planner JSON in your own Google Drive.</p></div>
      <button class="v52-info-button" id="driveHelpButton" type="button" aria-label="Learn about Google Drive backup" aria-haspopup="dialog">i</button>
    </div>
    <div class="v53-drive-status"><span class="v53-drive-dot" id="driveStatusDot"></span><strong id="driveStatusTitle">Not connected</strong><span id="driveStatusDetail">Connect Google Drive to save a backup.</span></div>
    <div class="v53-drive-meta">
      <div class="v53-drive-meta-row"><span>Drive backup</span><strong id="driveBackupModified">Not saved yet</strong></div>
      <div class="v53-drive-meta-row"><span>Automatic backup</span><label class="v53-switch"><input id="driveAutoBackup" type="checkbox" checked> Save changes while connected</label></div>
    </div>
    <div class="v53-drive-actions">
      <button class="button primary" id="driveConnect" type="button">Connect Google Drive</button>
      <button class="button primary" id="driveSave" type="button" hidden>Save now</button>
      <button class="button" id="driveRestore" type="button" hidden>Restore from Drive</button>
      <button class="button" id="driveRefresh" type="button" hidden>Check Drive</button>
      <button class="button" id="driveDisconnect" type="button" hidden>Disconnect</button>
    </div>
    <div class="v53-drive-conflict" id="driveConflict" hidden>
      <strong>The two copies are different.</strong>
      <p>Nothing will be overwritten until you choose which copy to keep.</p>
      <div class="v53-drive-actions"><button class="button" id="driveUseRemote" type="button">Use Drive backup</button><button class="button primary" id="driveUseLocal" type="button">Use this browser</button></div>
    </div>
    <div class="v53-drive-privacy"><strong>Privacy:</strong> Finance Planner requests only <code>drive.file</code>. The OAuth access token stays in memory and is not saved in localStorage or in your backup. No Google client secret is used in this browser app.</div>`;

  const localDataCard = [...grid.querySelectorAll('.settings-card')].find(item => item.querySelector('h2')?.textContent.trim() === 'Local data');
  grid.insertBefore(card, localDataCard || null);

  const dialog = document.createElement('dialog');
  dialog.id = 'v53DriveHelpDialog';
  dialog.className = 'v52-help-dialog';
  dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><h2>Google Drive backup</h2></div><div class="dialog-body v53-drive-help-copy"><p><strong>What it does:</strong> saves the same JSON data used by Export backup into a Finance Planner folder in your Google Drive.</p><p><strong>What Google can access:</strong> the app asks for the narrow <code>drive.file</code> scope, so it can work with files it creates or files you explicitly give it access to—not your entire Drive.</p><p><strong>What stays private:</strong> the temporary Google access token is kept only in memory. Finance Planner does not store a refresh token, client secret, Google password, or Drive file ID.</p><p><strong>Conflicts:</strong> if this browser and Drive both changed, Finance Planner stops and asks which copy to keep instead of silently overwriting either one.</p></div><div class="dialog-actions"><button class="button primary" value="close">Got it</button></div></form>`;
  document.body.append(dialog);

  $('#driveConnect')?.addEventListener('click', connectDrive);
  $('#driveSave')?.addEventListener('click', () => saveNow());
  $('#driveRestore')?.addEventListener('click', restoreFromDrive);
  $('#driveRefresh')?.addEventListener('click', refreshDrive);
  $('#driveDisconnect')?.addEventListener('click', disconnectDrive);
  $('#driveUseRemote')?.addEventListener('click', restoreFromDrive);
  $('#driveUseLocal')?.addEventListener('click', () => saveNow({ force: true }));
  $('#driveHelpButton')?.addEventListener('click', () => dialog.showModal());
  $('#driveAutoBackup')?.addEventListener('change', event => {
    meta = writeCloudMeta({ ...meta, autoBackup: event.target.checked });
    render();
    if (event.target.checked) scheduleAutoBackup();
  });

  render();
}

function updateVersionLabels() {
  document.documentElement.dataset.financePlannerVersion = APP_VERSION;
  const brand = $('#brandVersion');
  const app = $('#appVersion');
  if (brand) brand.textContent = `v${APP_VERSION}`;
  if (app) app.textContent = APP_VERSION;
}

function init() {
  ensureStyles();
  buildCard();
  updateVersionLabels();
  store.subscribe(() => {
    updateVersionLabels();
    scheduleAutoBackup();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
