const COPY = [
  {
    label: 'Cash coverage',
    detail: 'How many months of recurring spending your current balance could cover.'
  },
  {
    label: 'Planned change · 12 months',
    detail: 'Planned income minus planned spending over the next year.'
  },
  {
    label: 'Emergency cushion',
    detail: 'The amount reserved for the number of months selected in Forecast settings.'
  },
  {
    label: 'Recurring-cost share',
    detail: 'Recurring spending as a share of recurring income. Lower leaves more room for other goals and unexpected costs.'
  },
  {
    label: 'Large bills reserve',
    detail: 'Money reserved for large one-time and yearly costs scheduled in the next 12 months.'
  },
  {
    label: 'Conservative forecast',
    detail: 'The lower end of the 12-month forecast range. This is intentionally more cautious than the main estimate.'
  }
];

const STATUS = new Map([
  ['strong', 'Looks strong'],
  ['good', 'Looks good'],
  ['watch', 'Review'],
  ['risk', 'Needs attention']
]);

let queued = false;

function applyHealthCopy() {
  queued = false;
  document.querySelectorAll('#v5HealthGrid .v5-health-card').forEach((card, index) => {
    const copy = COPY[index];
    if (!copy) return;
    const label = card.querySelector('.v5-health-label');
    const detail = card.querySelector('p');
    const status = card.querySelector('.v5-health-status');
    if (label && label.textContent !== copy.label) label.textContent = copy.label;
    if (detail && detail.textContent !== copy.detail) detail.textContent = copy.detail;
    if (status) {
      const raw = [...STATUS.keys()].find(key => card.classList.contains(`status-${key}`));
      const friendly = STATUS.get(raw);
      if (friendly && status.textContent !== friendly) status.textContent = friendly;
    }
  });
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(applyHealthCopy);
}

const grid = document.getElementById('v5HealthGrid');
if (grid) new MutationObserver(schedule).observe(grid, { childList: true });
window.addEventListener('load', schedule, { once: true });
schedule();

export { COPY as HEALTH_COPY };
