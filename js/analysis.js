// Pure analysis code: angles, repetition tracking, fatigue, summaries and progress.
// A set record is a plain object:
//   { id, ex, arm:'left'|'right', kg, at:ISO, dur, reps:[{s,e,mn,mx,w?}], fat?, marks:[], video:bool, note, pz?, pl,
//     cam?:'user'|'environment', sd? (hold sets: wrist steadiness in degrees) }

import { intensityStatus, recommendedKg, intensityText, freqMax } from './exercises.js';

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const stdDev = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
};

/** Interior angle in degrees at b formed by a-b-c. Points are {x, y} in a space with square pixels. */
export function jointAngle(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (mag === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

export const repRange = (r) => r.mx - r.mn;

/** Number of points of a repetition's angle curve. */
export const CURVE_N = 24;

/** Resamples [t, value] points (sorted by t) to n evenly spaced values, rounded to 0.1. Null with fewer than 2 points. */
export function resample(points, n = CURVE_N) {
  if (points.length < 2) return null;
  const t0 = points[0][0], t1 = points.at(-1)[0];
  if (t1 <= t0) return null;
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / (n - 1);
    while (j < points.length - 2 && points[j + 1][0] < t) j++;
    const [ta, va] = points[j], [tb, vb] = points[j + 1];
    const f = tb === ta ? 0 : Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
    out.push(Math.round((va + (vb - va) * f) * 10) / 10);
  }
  return out;
}
export const repDuration = (r) => r.e - r.s;
export const setAvgRange = (s) => mean(s.reps.map(repRange));
export const setAvgTempo = (s) => mean(s.reps.map(repDuration));

/**
 * Builds repetitions from (time, angle) samples by following the turning points of the signal.
 * A repetition is one full cycle: peak -> valley -> peak, and every leg has to move at least `delta`
 * degrees. Nothing depends on absolute angles, so it works for any camera position and any joint.
 * The range of a repetition is the valley against the higher of its two peaks.
 */
export class RepTracker {
  constructor(delta = 10, { minMs = 400, maxMs = 25000 } = {}) {
    this.delta = delta;
    this.minMs = minMs;
    this.maxMs = maxMs;
    this.reset();
  }
  reset() {
    this.reps = [];
    this.mode = 'init'; // 'init' | 'down' (looking for the next valley) | 'up' (looking for the next peak)
    this.hi = null; this.lo = null; // running extremes {v, t}
    this.prevPeak = null; this.valley = null;
    this.samples = []; // wrist samples since the last peak: [t, wrist]
    this.buf = []; // angle samples since the last peak: [t, angle], used for the curve of each repetition
  }
  add(tMs, angle, wrist) {
    if (wrist != null) this.samples.push([tMs, wrist]);
    this.buf.push([tMs, angle]);
    const d = this.delta;
    const pt = { v: angle, t: tMs };
    if (this.mode === 'init') {
      if (!this.hi || angle > this.hi.v) this.hi = pt;
      if (!this.lo || angle < this.lo.v) this.lo = pt;
      if (this.hi.v - angle >= d && this.hi.t <= this.lo.t) { // fell from a peak
        this.mode = 'down'; this.prevPeak = this.hi; this.lo = pt; this.samples = this.samples.filter((x) => x[0] >= this.hi.t);
        this.buf = this.buf.filter((x) => x[0] >= this.hi.t);
      } else if (angle - this.lo.v >= d && this.lo.t <= this.hi.t) { // rose from a valley
        this.mode = 'up'; this.valley = this.lo; this.hi = pt;
      }
      return;
    }
    if (this.mode === 'down') {
      if (angle < this.lo.v) this.lo = pt;
      if (angle - this.lo.v >= d) { this.mode = 'up'; this.valley = this.lo; this.hi = pt; }
      return;
    }
    // mode 'up'
    if (angle > this.hi.v) this.hi = pt;
    if (this.hi.v - angle >= d) {
      if (this.prevPeak && this.valley) {
        const s = this.prevPeak.t, e = this.hi.t;
        if (e - s >= this.minMs && e - s <= this.maxMs) { // faster or slower than any real repetition: noise
          const rep = { s, e, mn: this.valley.v, mx: Math.max(this.prevPeak.v, this.hi.v) };
          const w = this.samples.filter((x) => x[0] >= s && x[0] <= e).map((x) => x[1]);
          if (w.length) rep.w = mean(w);
          const c = resample(this.buf.filter((x) => x[0] >= s && x[0] <= e));
          if (c) rep.c = c;
          this.reps.push(rep);
        }
      }
      this.prevPeak = this.hi;
      this.samples = this.samples.filter((x) => x[0] >= this.hi.t);
      this.buf = this.buf.filter((x) => x[0] >= this.hi.t);
      this.mode = 'down';
      this.lo = pt;
    }
  }
}

/**
 * Cleans an angle stream: median of the last three samples (kills single-frame spikes) and then exponential
 * smoothing. Call reset() when the arm was lost.
 */
export class AngleFilter {
  constructor(alpha = 0.5) { this.alpha = alpha; this.reset(); }
  reset() { this.last = []; this.v = null; }
  push(x) {
    this.last.push(x);
    if (this.last.length > 3) this.last.shift();
    const med = [...this.last].sort((a, b) => a - b)[this.last.length >> 1];
    this.v = this.v == null ? med : this.v + this.alpha * (med - this.v);
    return this.v;
  }
}

/** Exponential smoothing for an angle stream; call reset() when the arm was lost. */
export class Smoother {
  constructor(alpha = 0.5) { this.alpha = alpha; this.v = null; }
  push(x) { this.v = this.v == null ? x : this.v + this.alpha * (x - this.v); return this.v; }
  reset() { this.v = null; }
}

/** First rep (1-based) where range falls 15% or tempo slows 25% against the first three. Needs 5+ reps. */
export function detectFatigue(reps) {
  if (reps.length < 5) return null;
  const base = reps.slice(0, 3);
  const baseRange = mean(base.map(repRange));
  const baseTempo = mean(base.map(repDuration));
  for (let i = 3; i < reps.length; i++) {
    if (repRange(reps[i]) < baseRange * 0.85 || repDuration(reps[i]) > baseTempo * 1.25) return i + 1;
  }
  return null;
}

const sec = (ms, d = 1) => (ms / 1000).toFixed(d);

/** targets (optional): { range, tempoLo, tempoHi, rangeSrc } from references; the exercise defaults are used otherwise. */
export function summarize(reps, ex, targets = null) {
  const T = { range: targets?.range ?? ex.minRange, tempoLo: targets?.tempoLo ?? ex.tempoMinMs, tempoHi: targets?.tempoHi ?? ex.tempoMaxMs };
  const ranges = reps.map(repRange);
  const avgRange = mean(ranges);
  const tempo = mean(reps.map(repDuration));
  const variation = avgRange === 0 ? 0 : stdDev(ranges) / avgRange;
  const fatigue = detectFatigue(reps);
  const tips = [];
  if (reps.length < 3) {
    tips.push({ level: 'info', title: 'Pocas repeticiones',
      text: 'Con menos de 3 repeticiones válidas no se puede analizar la serie. Revisa la posición de la cámara.' });
  } else {
    const src = targets?.rangeSrc ? ` (${targets.rangeSrc})` : '';
    if (avgRange < T.range) {
      tips.push({ level: 'warn', title: 'Rango corto',
        text: `Tu rango medio fue ${Math.round(avgRange)}° y el objetivo es ${Math.round(T.range)}° o más${src}. Baja el peso y completa el movimiento.` });
    } else {
      tips.push({ level: 'good', title: 'Rango completo',
        text: `Rango medio de ${Math.round(avgRange)}°, por encima del objetivo de ${Math.round(T.range)}°${src}.` });
    }
    if (tempo < T.tempoLo) {
      tips.push({ level: 'warn', title: 'Demasiado rápido',
        text: `Cada repetición duró ${sec(tempo)} s. Apunta a ${sec(T.tempoLo)} s o más y controla la bajada.` });
    } else if (tempo > T.tempoHi) {
      tips.push({ level: 'info', title: 'Tempo lento',
        text: `Cada repetición duró ${sec(tempo)} s. Está bien para trabajo isométrico; si no era la idea, acelera un poco.` });
    } else {
      tips.push({ level: 'good', title: 'Tempo controlado',
        text: `${sec(tempo)} s por repetición, dentro del rango de ${sec(T.tempoLo)} a ${sec(T.tempoHi)} s.` });
    }
    if (variation > 0.15) {
      tips.push({ level: 'warn', title: 'Rango irregular',
        text: 'El rango cambia mucho entre repeticiones. Busca repetir siempre el mismo recorrido.' });
    }
    if (fatigue != null) {
      tips.push({ level: 'warn', title: `Fatiga desde la repetición ${fatigue}`,
        text: 'Desde ahí el rango baja o el tempo se alarga. Corta la serie ahí o baja el peso: llegar al fallo es lo que provoca las tendinitis.' });
    }
  }
  return {
    reps: reps.length, avgRange, avgMin: mean(reps.map((r) => r.mn)), avgMax: mean(reps.map((r) => r.mx)),
    avgTempoMs: tempo, rangeVariation: variation, fatigueRep: fatigue, tips,
  };
}

// ---- progress ---------------------------------------------------------------------------------
export const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Monday 00:00 of the week containing d. */
export function weekStart(d) {
  const x = dayOf(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const when = (s) => new Date(s.at);

/** Sets recorded on the same calendar day as `day`. */
export const setsInDay = (sets, day) => sets.filter((s) => dayKey(when(s)) === dayKey(day));

/** Sets recorded in the Monday-to-Sunday week that contains `ref`. */
export function setsInWeek(sets, ref) {
  const start = weekStart(ref), end = addDays(start, 7);
  return sets.filter((s) => when(s) >= start && when(s) < end);
}

export function trainingDaysInWeek(sets, ref) {
  const start = weekStart(ref), end = addDays(start, 7);
  return new Set(sets.filter((s) => when(s) >= start && when(s) < end).map((s) => dayKey(when(s)))).size;
}

/** Consecutive weeks (ending this week, or last week if this one is not done yet) with >= goal training days. */
export function weeklyStreak(sets, goal, now) {
  if (goal <= 0) return 0;
  let week = weekStart(now);
  if (trainingDaysInWeek(sets, week) < goal) week = addDays(week, -7);
  let streak = 0;
  while (trainingDaysInWeek(sets, week) >= goal) {
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

function perDay(sets, pick) {
  const by = new Map();
  for (const s of sets) {
    const v = pick(s);
    if (v == null) continue;
    const k = dayKey(when(s));
    if (!by.has(k)) by.set(k, { date: dayOf(when(s)), vals: [] });
    by.get(k).vals.push(v);
  }
  return [...by.values()].sort((a, b) => a.date - b.date);
}

export const rangeTrend = (sets, exId, arm) =>
  perDay(sets.filter((s) => s.ex === exId && (!arm || s.arm === arm)), (s) => (s.reps.length ? setAvgRange(s) : null))
    .map((d) => ({ date: d.date, value: mean(d.vals) }));

export const weightTrend = (sets, exId) =>
  perDay(sets.filter((s) => s.ex === exId), (s) => s.kg).map((d) => ({ date: d.date, value: Math.max(...d.vals) }));

/** For hold exercises pass hold=true: the compared value is the time under tension (in seconds) instead of the range. */
export function compareArms(sets, exId, now, days = 30, hold = false) {
  const since = new Date(now.getTime() - days * 86400000);
  const pick = (a) => sets.filter((s) => s.ex === exId && s.arm === a && (hold ? s.dur > 0 : s.reps.length) && when(s) > since);
  const l = pick('left'), r = pick('right');
  const val = hold ? (s) => s.dur / 1000 : setAvgRange;
  const out = {
    leftRange: mean(l.map(val)), rightRange: mean(r.map(val)),
    leftTempoMs: mean(l.map(setAvgTempo)), rightTempoMs: mean(r.map(setAvgTempo)),
    leftSets: l.length, rightSets: r.length,
  };
  out.hasBoth = l.length > 0 && r.length > 0;
  const top = Math.max(out.leftRange, out.rightRange);
  /** Positive: the right arm has the larger range. */
  out.rangeGapPct = top === 0 ? 0 : ((out.rightRange - out.leftRange) / top) * 100;
  return out;
}

export const painEvents = (sets) =>
  sets.filter((s) => s.pz && s.pl > 0).sort((a, b) => when(b) - when(a));

export const weekdayShort = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const weekdayName = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const monthShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const formatDay = (d) => `${d.getDate()} ${monthShort[d.getMonth()]}`;
export const formatTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const fmtKg = (kg) => `${Number.isInteger(kg) ? kg : kg}`;

/** Average score (0-100) per training day for one exercise. */
export const scoreTrend = (sets, exId) =>
  perDay(sets.filter((s) => s.ex === exId), (s) => s.sc?.total ?? null).map((d) => ({ date: d.date, value: mean(d.vals) }));

/** Average time under tension per training day for a hold exercise, in seconds. */
export const holdTrend = (sets, exId) =>
  perDay(sets.filter((s) => s.ex === exId), (s) => (s.dur > 0 ? s.dur / 1000 : null)).map((d) => ({ date: d.date, value: mean(d.vals) }));

/** Distinct days of the week containing ref on which this exercise was trained. */
export function weeklyDaysFor(sets, exId, ref) {
  const start = weekStart(ref), end = addDays(start, 7);
  return new Set(sets.filter((s) => s.ex === exId && when(s) >= start && when(s) < end).map((s) => dayKey(when(s)))).size;
}

/** Summary of an isometric set: time under tension and wrist steadiness (sd in degrees, lower is steadier). */
export function summarizeHold(durMs, sd) {
  const seconds = durMs / 1000;
  const tips = [];
  if (seconds < 5) {
    tips.push({ level: 'info', title: 'Tiempo corto', text: 'Con menos de 5 segundos no se puede valorar la serie.' });
  } else {
    tips.push({ level: 'info', title: 'Tiempo bajo tensión', text: `${Math.round(seconds)} s. Busca series que puedas repetir sin perder la forma, sin llegar al fallo.` });
    if (sd != null) {
      if (sd <= 5) tips.push({ level: 'good', title: 'Muñeca firme', text: `La muñeca se movió ±${sd.toFixed(1)}° durante la serie.` });
      else if (sd <= 10) tips.push({ level: 'info', title: 'Muñeca algo inestable', text: `La muñeca se movió ±${sd.toFixed(1)}°. Intenta mantenerla neutra.` });
      else tips.push({ level: 'warn', title: 'Muñeca inestable', text: `La muñeca se movió ±${sd.toFixed(1)}°. Baja la carga: suele ser señal de que estás cerca del fallo.` });
    }
  }
  return { seconds, sd, tips };
}

const kgText = (v) => `${Math.round(v * 10) / 10}`;

/** Tips about the weight used compared with the 1RM guideline. Empty without a 1RM. */
export function intensityTips(ex, kg, oneRm) {
  const st = intensityStatus(ex, kg, oneRm);
  const rec = recommendedKg(ex, oneRm);
  if (st === 'max') {
    return [{ level: 'warn', title: 'Cerca de tu máximo',
      text: `Usaste ${kgText(kg)} kg, más del 90% de tu 1RM. No entrenes al máximo: es lo que provoca las lesiones. Trabaja con ${kgText(rec.low)}-${kgText(rec.high)} kg.` }];
  }
  if (st === 'high') {
    return [{ level: 'warn', title: 'Peso por encima de lo recomendado',
      text: `Para ${ex.name} la guía es ${intensityText(ex)} (${kgText(rec.low)}-${kgText(rec.high)} kg con tu 1RM de ${kgText(oneRm)} kg). Usaste ${kgText(kg)} kg.` }];
  }
  return st === 'ok' ? [{ level: 'good', title: 'Peso dentro de la guía', text: `${kgText(kg)} kg está dentro de ${intensityText(ex)}.` }] : [];
}

/** Warns when this exercise was already trained on more days than recommended this week. */
export function frequencyTips(ex, daysThisWeek, sparring = false) {
  const max = freqMax(ex, sparring);
  if (daysThisWeek > max) {
    return [{ level: 'warn', title: 'Frecuencia semanal superada',
      text: `Es el día ${daysThisWeek} de esta semana con ${ex.name} y la guía es máx. ${max}. Deja descansar ese tendón.` }];
  }
  return [];
}

/**
 * Explains why a set has few or no repetitions, from how much of the time the arm was seen (cov, 0..1)
 * and the observed angle swing (obs = [min, max]). Returns tips in the same shape as summarize().
 */
export function diagnoseSet(set, ex, delta) {
  if (set.cov == null) return [];
  const out = [];
  const pct = Math.round(set.cov * 100);
  const swing = set.obs ? set.obs[1] - set.obs[0] : 0;
  if (set.cov < 0.5) {
    out.push({ level: 'warn', title: `Solo vi tu brazo el ${pct}% del tiempo`,
      text: 'Acerca o aleja el móvil hasta que se vean el codo, la muñeca y la mano completos, con buena luz. Si usas la cámara frontal, apoya el móvil firme frente a ti. Si la app te ve el otro brazo, cambia el brazo elegido.' });
  } else if (set.cov < 0.8) {
    out.push({ level: 'info', title: `Detección parcial: ${pct}%`, text: 'Se perdió el brazo varias veces. Más luz y el brazo siempre dentro de la imagen mejoran el conteo.' });
  }
  if (set.reps.length < 3 && set.cov >= 0.5) {
    if (swing < delta) {
      out.push({ level: 'warn', title: 'El ángulo casi no cambió',
        text: `Solo se vio un movimiento de ${Math.round(swing)}° y hace falta al menos ${delta}° por tramo. La cámara no está viendo el movimiento: prueba otra posición (de lado suele ir mejor) o mueve el brazo a la vista.` });
    } else {
      out.push({ level: 'info', title: 'Hubo movimiento, pero no repeticiones completas',
        text: `Se vio un movimiento de ${Math.round(swing)}°. Cada repetición tiene que bajar y volver a subir al menos ${delta}°. Haz el recorrido completo en cada una.` });
    }
  }
  return out;
}
