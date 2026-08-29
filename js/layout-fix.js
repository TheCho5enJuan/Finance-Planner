import './v51-ui.js';

// Canvas charts use their rendered CSS size to build a high-DPI backing bitmap.
// On a cold load Chrome can execute the chart modules before the final grid width
// has settled, leaving the first bitmap scaled and blurry until a real resize.
// Trigger the app's existing resize redraw after layout/fonts settle and whenever
// the main content width changes without a window resize.

let refreshTimer = 0;
let refreshFrame = 0;

function redrawCharts() {
  window.dispatchEvent(new Event('resize'));
}

function scheduleChartRedraw() {
  window.clearTimeout(refreshTimer);
  window.cancelAnimationFrame(refreshFrame);

  refreshFrame = window.requestAnimationFrame(() => {
    refreshFrame = window.requestAnimationFrame(redrawCharts);
  });

  // The dashboard view has a short entrance animation. This second pass ensures
  // the canvas is measured again after that animation and font layout complete.
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
