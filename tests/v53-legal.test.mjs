import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const privacy = await readFile(new URL('../privacy.html', import.meta.url), 'utf8');
const terms = await readFile(new URL('../terms.html', import.meta.url), 'utf8');
const legal = await readFile(new URL('../js/v53-legal.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../js/layout-fix.js', import.meta.url), 'utf8');

function requireText(source, phrases) {
  for (const phrase of phrases) assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `missing: ${phrase}`);
}

test('privacy policy discloses Google Drive access, use, storage, and sharing', () => {
  requireText(privacy, [
    'Privacy Policy',
    'drive.file',
    'Google Drive backup is optional',
    'temporary Google OAuth access token',
    'does not store a Google password',
    'does not sell your personal or financial information',
    'Google API Services User Data Policy',
    'Limited Use',
    'Reset local data',
    'juannovoa@gmail.com'
  ]);
  assert.match(privacy, /href="\.\/terms\.html"/);
  assert.match(privacy, /href="\.\/"/);
});

test('terms identify Finance Planner as a planning tool and link privacy policy', () => {
  requireText(terms, [
    'Terms of Service',
    'not a bank',
    'Google Drive integration',
    'No warranty',
    'Limitation of liability',
    'juannovoa@gmail.com'
  ]);
  assert.match(terms, /href="\.\/privacy\.html"/);
  assert.match(terms, /href="\.\/"/);
});

test('homepage UI exposes privacy and terms links and a Drive privacy notice', () => {
  assert.match(layout, /import '\.\/v53-legal\.js\?v=5\.3\.0'/);
  assert.match(legal, /PRIVACY_URL = '\.\/privacy\.html'/);
  assert.match(legal, /TERMS_URL = '\.\/terms\.html'/);
  assert.match(legal, /v53LegalSidebar/);
  assert.match(legal, /Privacy & terms/);
  assert.match(legal, /v53DriveLegalNotice/);
  assert.match(legal, /By connecting Google Drive/);
});
