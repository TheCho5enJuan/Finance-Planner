import './v51-ui.js?v=5.1.1';
import './v51-insights.js?v=5.1.1';
import './v52-clarity.js?v=5.2.0';
import './v52-health-copy.js?v=5.2.0';

const DISPLAY_VERSION = '5.2.0';

function syncDisplayedVersion() {
  const brand = document.getElementById('brandVersion');
  const settings = document.getElementById('appVersion');
  if (brand && brand.textContent !== `v${DISPLAY_VERSION}`) brand.textContent = `v${DISPLAY_VERSION}`;
  if (settings && settings.textContent !== DISPLAY_VERSION) settings.textContent = DISPLAY_VERSION;
}

// V5 still contains the original 5.0.0 injection fallback. Keep the displayed
// release metadata aligned with the current UI layer until that legacy injector
// is removed in the next architecture cleanup.
syncDisplayedVersion();
const versionObserver = new MutationObserver(syncDisplayedVersion);
['brandVersion', 'appVersion'].forEach(id => {
  const target = document.getElementById(id);
  if (target) versionObserver.observe(target, { childList: true, characterData: true, subtree: true });
});

// Canvas charts use their rendered CSS size to build a high-DPI backing bitmap.
// On a cold load Chrome can execute the chart modules before the final grid width
// has settled, leaving the first bitmap scaled and blurry until a real resize.
// Trigger the app's existing resize redraw after layout/fonts settle and whenever
// the main content width changes without a window resize.

let refreshTimer = 0;
let refreshFrame = 0;

function redrawCharts() {
  syncDisplayedVersion();
  window.dispatchEvent(new Event('resize'));
}

function scheduleChartRedraw() {
  window.clearTimeout(refreshTimer);
  window.cancelAnimationFrame(refreshFrame);

  refreshFrame = window.requestAnimationFrame(() => {
    refreshFrame = window.requestAnimationFrame(redrawCharts);
  });

  refreshTimer = window.setTimeout(redrawCharts, 320);
}

if (document.readyState === 'complete') scheduleChartRedraw();
else window.addEventListener('load', scheduleChartRedraw, { once: true });

document.fonts?.ready?.then(scheduleChartRedraw).catch(() => {});

const main = document.querySelector('.main');
if (main && 'ResizeObserver' in window) {
  let lastWidth = -1;
  const observer = new ResizeObserver(entries => {
    const width = Math.round(entries[0]?.contentRect?.width || 0);
    if (!width || width === lastWidth) return;
    lastWidth = width;
    scheduleChartRedraw();
  });
  observer.observe(main);
}
