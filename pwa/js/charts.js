// SVG charts. Colours come from CSS variables so they follow the theme.
import { formatDay } from './analysis.js';

const TEAL = '#3FE0C5', WARN = '#FFB347', COPPER = '#FF8A4C';

/** One bar per repetition. Bars from highlightFrom (0-based) on are drawn amber. */
export function repBars(values, { target, highlightFrom, unit = '°', decimals = 0, height = 120 } = {}) {
  if (!values.length) return '';
  const W = 340, labelH = 16, plotH = height - labelH;
  let top = Math.max(...values, target ?? 0) * 1.1 || 1;
  const n = values.length, gap = 6;
  const barW = Math.min(40, Math.max(4, (W - gap * (n - 1)) / n));
  const left = (W - (barW * n + gap * (n - 1))) / 2;
  let out = `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="Barras por repetición">
    <defs>
      <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TEAL}"/><stop offset="1" stop-color="${TEAL}" stop-opacity=".2"/></linearGradient>
      <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${WARN}"/><stop offset="1" stop-color="${WARN}" stop-opacity=".2"/></linearGradient>
    </defs>`;
  values.forEach((v, i) => {
    const h = (v / top) * plotH, x = left + i * (barW + gap);
    const warn = highlightFrom != null && i >= highlightFrom;
    out += `<rect x="${x.toFixed(1)}" y="${(plotH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="5" fill="url(#${warn ? 'gw' : 'gt'})"/>`;
    out += `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 3}" text-anchor="middle">${i + 1}</text>`;
  });
  if (target != null) {
    const y = plotH - (target / top) * plotH;
    out += `<line x1="0" x2="${W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#fff" stroke-opacity=".5" stroke-dasharray="5 5"/>`;
    out += `<text x="${W}" y="${(y - 4).toFixed(1)}" text-anchor="end">objetivo ${target.toFixed(decimals)}${unit}</text>`;
  }
  return out + '</svg>';
}

/** Line chart: one value per training day, faint grid, emphasised last point. */
export function trendChart(points, { unit = '°', color = TEAL, height = 130 } = {}) {
  if (!points.length) return '';
  const W = 340, padL = 36, padR = 8, padT = 8, padB = 20;
  const pw = W - padL - padR, ph = height - padT - padB;
  let lo = Math.min(...points.map((p) => p.value)), hi = Math.max(...points.map((p) => p.value));
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15;
  lo -= pad; hi += pad;
  const y = (v) => padT + ph - ((v - lo) / (hi - lo)) * ph;
  const t0 = points[0].date.getTime(), span = points.at(-1).date.getTime() - t0;
  const x = (i) => (points.length === 1 || span === 0 ? padL + pw / 2 : padL + ((points[i].date.getTime() - t0) / span) * pw);
  let out = `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="Tendencia">`;
  for (let i = 0; i <= 2; i++) {
    const v = lo + ((hi - lo) * i) / 2, yy = y(v);
    out += `<line x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#fff" stroke-opacity=".08"/>`;
    out += `<text x="${padL - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}${unit}</text>`;
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  if (points.length > 1) {
    out += `<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`;
    out += `<path d="${d} L${x(points.length - 1).toFixed(1)} ${padT + ph} L${x(0).toFixed(1)} ${padT + ph} Z" fill="url(#area)"/>`;
    out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  points.forEach((p, i) => {
    const last = i === points.length - 1;
    out += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${last ? 6 : 3.5}" fill="${last ? COPPER : color}"${last ? ' stroke="#0E1118" stroke-width="2"' : ''}/>`;
  });
  out += `<text x="${padL}" y="${height - 4}">${formatDay(points[0].date)}</text>`;
  if (points.length > 1) out += `<text x="${W - padR}" y="${height - 4}" text-anchor="end">${formatDay(points.at(-1).date)}</text>`;
  return out + '</svg>';
}
