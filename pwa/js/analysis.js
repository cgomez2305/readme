// Pure analysis code: angles, repetition tracking, fatigue, summaries and progress.
// A set record is a plain object:
//   { id, ex, arm:'left'|'right', kg, at:ISO, dur, reps:[{s,e,mn,mx,w?}], fat?, marks:[], video:bool, note, pz?, pl }

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
export const repDuration = (r) => r.e - r.s;
export const setAvgRange = (s) => mean(s.reps.map(repRange));
export const setAvgTempo = (s) => mean(s.reps.map(repDuration));

/**
 * Builds repetitions from (time, angle) samples. A rep starts when the angle drops below
 * openAbove, is valid once it goes below closedBelow, and ends when it returns above openAbove.
 * Partial moves that never reach closedBelow are discarded. The range uses the highest angle
 * seen before the drop, so it covers the whole movement.
 */
export class RepTracker {
  constructor(openAbove, closedBelow) {
    this.openAbove = openAbove;
    this.closedBelow = closedBelow;
    this.reps = [];
    this.reset();
  }
  reset() {
    this.reps = [];
    this.inRep = false;
    this.reached = false;
    this.openPeak = 0;
    this.start = 0;
    this.min = 180;
    this.max = 0;
    this.wristSum = 0;
    this.wristN = 0;
  }
  add(tMs, angle, wrist) {
    if (!this.inRep) {
      if (angle >= this.openAbove) {
        if (angle > this.openPeak) this.openPeak = angle;
        return;
      }
      this.inRep = true;
      this.reached = false;
      this.start = tMs;
      this.min = angle;
      this.max = Math.max(angle, this.openPeak);
      this.wristSum = 0;
      this.wristN = 0;
    }
    if (angle < this.min) this.min = angle;
    if (angle > this.max) this.max = angle;
    if (wrist != null) {
      this.wristSum += wrist;
      this.wristN++;
    }
    if (angle < this.closedBelow) this.reached = true;
    if (angle >= this.openAbove) {
      if (this.reached) {
        const rep = { s: this.start, e: tMs, mn: this.min, mx: this.max };
        if (this.wristN) rep.w = this.wristSum / this.wristN;
        this.reps.push(rep);
      }
      this.inRep = false;
      this.openPeak = angle;
    }
  }
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

export function summarize(reps, ex) {
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
    if (avgRange < ex.minRange) {
      tips.push({ level: 'warn', title: 'Rango corto',
        text: `Tu rango medio fue ${Math.round(avgRange)}° y el objetivo es ${Math.round(ex.minRange)}° o más. Baja el peso y completa el movimiento.` });
    } else {
      tips.push({ level: 'good', title: 'Rango completo',
        text: `Rango medio de ${Math.round(avgRange)}°, por encima del objetivo de ${Math.round(ex.minRange)}°.` });
    }
    if (tempo < ex.tempoMinMs) {
      tips.push({ level: 'warn', title: 'Demasiado rápido',
        text: `Cada repetición duró ${sec(tempo)} s. Apunta a ${sec(ex.tempoMinMs)} s o más y controla la bajada.` });
    } else if (tempo > ex.tempoMaxMs) {
      tips.push({ level: 'info', title: 'Tempo lento',
        text: `Cada repetición duró ${sec(tempo)} s. Está bien para trabajo isométrico; si no era la idea, acelera un poco.` });
    } else {
      tips.push({ level: 'good', title: 'Tempo controlado',
        text: `${sec(tempo)} s por repetición, dentro del rango de ${sec(ex.tempoMinMs)} a ${sec(ex.tempoMaxMs)} s.` });
    }
    if (variation > 0.15) {
      tips.push({ level: 'warn', title: 'Rango irregular',
        text: 'El rango cambia mucho entre repeticiones. Busca repetir siempre el mismo recorrido.' });
    }
    if (fatigue != null) {
      tips.push({ level: 'warn', title: `Fatiga desde la repetición ${fatigue}`,
        text: 'Desde ahí el rango baja o el tempo se alarga. Considera cortar la serie ahí o bajar el peso.' });
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

export function compareArms(sets, exId, now, days = 30) {
  const since = new Date(now.getTime() - days * 86400000);
  const pick = (a) => sets.filter((s) => s.ex === exId && s.arm === a && s.reps.length && when(s) > since);
  const l = pick('left'), r = pick('right');
  const out = {
    leftRange: mean(l.map(setAvgRange)), rightRange: mean(r.map(setAvgRange)),
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
