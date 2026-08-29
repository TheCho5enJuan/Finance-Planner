export function placeAfterIfNeeded(reference, node) {
  if (!reference || !node || reference === node) return false;
  if (reference.nextElementSibling === node) return false;
  reference.after(node);
  return true;
}

export function shouldStopInsightsObserver({ health, history, categories }) {
  return Boolean(health && history && categories);
}
