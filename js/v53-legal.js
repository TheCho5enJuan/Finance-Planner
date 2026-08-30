const PRIVACY_URL = './privacy.html';
const TERMS_URL = './terms.html';

function ensureStyles() {
  if (document.getElementById('v53LegalStyles')) return;
  const link = document.createElement('link');
  link.id = 'v53LegalStyles';
  link.rel = 'stylesheet';
  link.href = './css/v53-legal.css?v=5.3.0';
  document.head.append(link);
}

function makeLink(label, href) {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  return link;
}

function addSidebarLinks() {
  const sidebar = document.querySelector('.sidebar');
  const foot = document.querySelector('.sidebar-foot');
  if (!sidebar || !foot || document.getElementById('v53LegalSidebar')) return;
  const links = document.createElement('div');
  links.id = 'v53LegalSidebar';
  links.className = 'v53-legal-sidebar';
  links.setAttribute('aria-label', 'Legal information');
  links.append(makeLink('Privacy', PRIVACY_URL), makeLink('Terms', TERMS_URL));
  foot.after(links);
}

function addSettingsCard() {
  const grid = document.querySelector('#view-settings .settings-grid');
  if (!grid || document.getElementById('v53LegalCard')) return;

  const card = document.createElement('section');
  card.id = 'v53LegalCard';
  card.className = 'surface-card settings-card v53-legal-card';

  const title = document.createElement('h2');
  title.textContent = 'Privacy & terms';
  const copy = document.createElement('p');
  copy.textContent = 'Finance Planner is local-first. Google Drive backup is optional and uses only the access needed to manage the Finance Planner files you authorize.';
  const links = document.createElement('div');
  links.className = 'v53-legal-inline';
  links.append(makeLink('Privacy Policy', PRIVACY_URL), makeLink('Terms of Service', TERMS_URL));
  card.append(title, copy, links);

  const localDataCard = [...grid.querySelectorAll('.settings-card')].find(item => item.querySelector('h2')?.textContent.trim() === 'Local data');
  grid.insertBefore(card, localDataCard || null);
}

function addDriveNotice() {
  const card = document.getElementById('driveBackupCard');
  if (!card || document.getElementById('v53DriveLegalNotice')) return;
  const notice = document.createElement('div');
  notice.id = 'v53DriveLegalNotice';
  notice.className = 'v53-privacy-notice';
  notice.append(
    document.createTextNode('By connecting Google Drive, you authorize Finance Planner to save and restore its backup file in your Drive. '),
    makeLink('Privacy Policy', PRIVACY_URL),
    document.createTextNode(' · '),
    makeLink('Terms', TERMS_URL)
  );
  card.append(notice);
}

function init() {
  ensureStyles();
  addSidebarLinks();
  addSettingsCard();
  addDriveNotice();

  const settings = document.getElementById('view-settings');
  if (settings && 'MutationObserver' in window) {
    const observer = new MutationObserver(() => {
      addSettingsCard();
      addDriveNotice();
      if (document.getElementById('v53LegalCard') && document.getElementById('v53DriveLegalNotice')) observer.disconnect();
    });
    observer.observe(settings, { childList: true, subtree: true });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
