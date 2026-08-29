import { money, toISODateLocal } from './utils.js';

export function drawBalanceChart(canvas, series, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, canvas.clientWidth || 320);
  const height = Math.max(220, Number(options.height || canvas.clientHeight || 280));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!series?.length) return;
  const styles = getComputedStyle(document.documentElement);
  const line = styles.getPropertyValue('--brand').trim() || '#0052ff';
  const text = styles.getPropertyValue('--muted').trim() || '#7c828a';
  const grid = styles.getPropertyValue('--hairline').trim() || '#dee1e6';
  const positive = styles.getPropertyValue('--positive').trim() || '#05b169';
  const negative = styles.getPropertyValue('--negative').trim() || '#cf202f';
  const surface = styles.getPropertyValue('--surface').trim() || '#fff';

  const xs = series.map(point => point.x.getTime());
  const ys = series.map(point => Number(point.y || 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minYRaw = Math.min(...ys);
  const maxYRaw = Math.max(...ys);
  const yPadding = Math.max((maxYRaw - minYRaw) * 0.12, 100);
  const minY = minYRaw - yPadding;
  const maxY = maxYRaw + yPadding;
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const pad = { left: 62, right: 18, top: 20, bottom: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xAt = point => pad.left + ((point.x.getTime() - minX) / dx) * plotW;
  const yAt = point => pad.top + (1 - ((point.y - minY) / dy)) * plotH;

  ctx.fillStyle = surface;
  ctx.fillRect(0, 0, width, height);
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= 4; i += 1) {
    const value = minY + (dy * i / 4);
    const y = pad.top + plotH - (plotH * i / 4);
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.fillText(money(value), 4, y);
  }

  if (minY < 0 && maxY > 0) {
    const y = pad.top + (1 - ((0 - minY) / dy)) * plotH;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = negative;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, 'rgba(0,82,255,.18)');
  gradient.addColorStop(1, 'rgba(0,82,255,0)');
  ctx.beginPath();
  series.forEach((point, index) => {
    const x = xAt(point);
    const y = yAt(point);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xAt(series.at(-1)), height - pad.bottom);
  ctx.lineTo(xAt(series[0]), height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  series.forEach((point, index) => {
    const x = xAt(point);
    const y = yAt(point);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  const end = series.at(-1);
  ctx.fillStyle = end.y >= 0 ? positive : negative;
  ctx.beginPath();
  ctx.arc(xAt(end), yAt(end), 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = text;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(toISODateLocal(series[0].x), pad.left, height - 10);
  const endLabel = toISODateLocal(end.x);
  const endWidth = ctx.measureText(endLabel).width;
  ctx.fillText(endLabel, width - pad.right - endWidth, height - 10);

  canvas._chartMeta = { series, minX, maxX, minY, maxY, pad, plotW, plotH, width, height };
}
