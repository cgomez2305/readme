// Scoring of an execution, and the reference profiles it is compared against. Pure code, no DOM.
//
// A reference is { id, ex, arm, source:'pro'|'mate'|'own', label, at, reps:[{d, r, mn, mx, c}] } where each
// repetition keeps its duration d (ms), range r, extremes and a normalised-able angle curve c (24 points).
// Only these numbers are stored, never the video.
//
// Targets for a set come from the best source available:
//   range / tempo: the user's own references, else references of other athletes, else the exercise defaults.
//   shape: references of other athletes, else the user's own. Without any reference there is no shape score.
// This is why the app does not ask for a huge angle: the range target is relative to what the camera really
// sees for this person, instead of a fixed number.
import { mean, stdDev, repRange, repDuration, CURVE_N } from './analysis.js';
import { MLP, aeScore } from './nn.js';

export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

export function percentile(xs, p) {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

/** Curve scaled to 0..1, or null when it is flat. */
export function normalizeCurve(c) {
  if (!c || c.length < 3) return null;
  const mn = Math.min(...c), mx = Math.max(...c);
  if (mx - mn < 1e-6) return null;
  return c.map((v) => (v - mn) / (mx - mn));
}

/** Pearson correlation of two equal-length arrays (0 when either is flat). */
export function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Repetitions of a reference or set in the reference shape {d, r, mn, mx, c}. */
export const toRefReps = (reps) =>
  reps.map((r) => ({ d: r.e - r.s, r: r.mx - r.mn, mn: r.mn, mx: r.mx, ...(r.c ? { c: r.c } : {}) }));

// ---- the trainable technique model -----------------------------------------------------------------
/** Scale used to turn a repetition into numbers the model can read: the exercise defaults, so it never changes. */
export const featScale = (ex) => ({ range: Math.max(1, ex.minRange), tempo: Math.max(500, (ex.tempoMinMs + ex.tempoMaxMs) / 2) });

/** Model input for one repetition {d, r, c}: its normalised curve plus how big and how long it was (all 0..1). */
export function repFeatures(rep, feat) {
  const c = normalizeCurve(rep.c);
  if (!c) return null;
  return [...c, clamp(rep.r / (2 * feat.range)), clamp(rep.d / (2 * feat.tempo))];
}

const runtime = new WeakMap(); // stored model -> networks ready to run
function nets(model) {
  if (!runtime.has(model)) {
    runtime.set(model, { ae: MLP.fromJSON(model.ae.net), clf: model.clf ? MLP.fromJSON(model.clf.net) : null });
  }
  return runtime.get(model);
}

/** 0-100 score of one repetition {d, r, c} from a trained model, or null when it cannot be computed. */
export function modelRepScore(model, rep, feat) {
  const f = model && repFeatures(rep, feat);
  if (!f || f.length !== model.ae.net.sizes[0]) return null;
  const { ae, clf } = nets(model);
  const a = aeScore(ae, model.ae.stats, f);
  return clf ? (a + clf.predict(f)[0] * 100) / 2 : a;
}

/** Summary of the references of one exercise: range and duration quartiles and the mean normalised curve. */
export function buildProfile(refs, exId) {
  const reps = refs.filter((r) => r.ex === exId).flatMap((r) => r.reps);
  const quart = (xs) => ({ p25: percentile(xs, 0.25), med: percentile(xs, 0.5), p75: percentile(xs, 0.75) });
  const ranges = reps.map((r) => r.r), durs = reps.map((r) => r.d);
  const curves = reps.map((r) => normalizeCurve(r.c)).filter(Boolean);
  const curve = curves.length ? Array.from({ length: CURVE_N }, (_, i) => mean(curves.map((c) => c[i]))) : null;
  return { n: reps.length, range: quart(ranges), dur: quart(durs), curve, curveN: curves.length };
}

/**
 * Targets for scoring one exercise. refs may mix the user's own ('own') and other athletes' ('pro', 'mate').
 * Returns { range, rangeSrc, tempoLo, tempoHi, tempoSrc, curve, curveSrc }.
 */
export function resolveTargets(ex, refs = [], model = null) {
  const own = buildProfile(refs.filter((r) => r.source === 'own'), ex.id);
  const others = buildProfile(refs.filter((r) => r.source !== 'own'), ex.id);
  const T = {
    range: ex.minRange, rangeSrc: 'objetivo por defecto',
    tempoLo: ex.tempoMinMs, tempoHi: ex.tempoMaxMs, tempoSrc: 'objetivo por defecto',
    curve: null, curveSrc: null, feat: featScale(ex), model,
  };
  if (own.n >= 3) {
    T.range = own.range.med * 0.85; T.rangeSrc = 'tu referencia';
    T.tempoLo = own.dur.p25 * 0.8; T.tempoHi = own.dur.p75 * 1.25; T.tempoSrc = 'tu referencia';
  } else if (others.n >= 3) {
    T.range = others.range.p25 * 0.8; T.rangeSrc = 'referencias';
    T.tempoLo = others.dur.p25 * 0.8; T.tempoHi = others.dur.p75 * 1.25; T.tempoSrc = 'referencias';
  }
  if (others.curveN >= 3) { T.curve = others.curve; T.curveSrc = 'referencias'; }
  else if (own.curveN >= 3) { T.curve = own.curve; T.curveSrc = 'tu referencia'; }
  return T;
}

// ---- one repetition ------------------------------------------------------------------------------
const rangeScore = (r, target) => {
  const ratio = r / Math.max(1, target);
  return ratio >= 1 ? 100 : 100 * Math.pow(clamp(ratio), 1.5);
};
const tempoScore = (d, lo, hi) => {
  if (d >= lo && d <= hi) return 100;
  if (d < lo) return 100 * clamp(1 - (1 - d / lo) * 2); // 50% too fast scores 0
  return 100 * clamp(1 - (d / hi - 1) * 1.5);
};
const shapeScore = (c, ref) => {
  const a = normalizeCurve(c);
  if (!a || !ref) return null;
  return 100 * clamp((correlation(a, ref) - 0.7) / (0.98 - 0.7));
};
/** Extra direction changes inside a repetition (jerks). A clean repetition goes down once and up once. */
export function wobbles(c, noise = 2) {
  if (!c || c.length < 4) return null;
  let dir = 0, changes = 0, lastExt = c[0];
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - lastExt;
    if (Math.abs(d) < noise) continue;
    const nd = Math.sign(d);
    if (dir !== 0 && nd !== dir) changes++;
    dir = nd; lastExt = c[i];
  }
  return Math.max(0, changes - 1); // the valley itself is one expected reversal
}
const controlScore = (c) => {
  const w = wobbles(c);
  return w == null ? null : 100 * clamp(1 - w * 0.3);
};

export function scoreRep(rep, T) {
  const range = rangeScore(rep.mx - rep.mn, T.range);
  const tempo = tempoScore(rep.e - rep.s, T.tempoLo, T.tempoHi);
  const shape = shapeScore(rep.c, T.curve);
  const control = controlScore(rep.c);
  const model = T.model ? modelRepScore(T.model, { d: rep.e - rep.s, r: rep.mx - rep.mn, c: rep.c }, T.feat) : null;
  const parts = [[range, 0.3], [tempo, 0.2], [shape, 0.15], [control, 0.1], [model, 0.25]].filter(([v]) => v != null);
  const w = parts.reduce((t, [, k]) => t + k, 0);
  return { total: parts.reduce((t, [v, k]) => t + v * k, 0) / w, range, tempo, shape, control, model };
}

export const grade = (total) => (total >= 90 ? 'Excelente' : total >= 75 ? 'Buena' : total >= 55 ? 'Mejorable' : 'Floja');

// ---- a whole set ---------------------------------------------------------------------------------
/**
 * Scores a set of repetitions (0-100). Returns null with no repetitions.
 * parts: range, tempo, consistency (null below 3 reps), technique (shape and control; null without data).
 */
export function scoreSet(reps, T) {
  if (!reps.length) return null;
  const per = reps.map((r) => scoreRep(r, T));
  const avg = (k) => {
    const v = per.map((p) => p[k]).filter((x) => x != null);
    return v.length ? mean(v) : null;
  };
  let consistency = null;
  if (reps.length >= 3) {
    const rs = reps.map(repRange), ds = reps.map(repDuration);
    const cv = (xs) => (mean(xs) ? stdDev(xs) / mean(xs) : 0);
    consistency = 100 * clamp(1 - (cv(rs) + cv(ds)) / 0.5);
  }
  const tech = [avg('shape'), avg('control'), avg('model'), avg('model')].filter((x) => x != null); // the model counts double
  const parts = { range: avg('range'), tempo: avg('tempo'), consistency, technique: tech.length ? mean(tech) : null };
  const weights = { range: 0.3, tempo: 0.2, consistency: 0.2, technique: 0.3 };
  const used = Object.keys(parts).filter((k) => parts[k] != null);
  const wsum = used.reduce((t, k) => t + weights[k], 0);
  // The weakest part counts extra: a set with a very short range or a rushed tempo cannot score well just
  // because the other parts are fine.
  const weighted = used.reduce((t, k) => t + parts[k] * weights[k], 0) / wsum;
  const total = 0.7 * weighted + 0.3 * Math.min(...used.map((k) => parts[k]));
  const round = (x) => (x == null ? null : Math.round(x));
  return {
    total: round(total), grade: grade(total),
    parts: { range: round(parts.range), tempo: round(parts.tempo), consistency: round(parts.consistency), technique: round(parts.technique) },
    perRep: per.map((p) => round(p.total)),
    tSrc: { range: T.rangeSrc, tempo: T.tempoSrc, shape: T.curveSrc, model: T.model ? T.model.nPos : null },
  };
}

/** Score of an isometric hold: how steady the wrist stayed (sd in degrees, lower is better). */
export function scoreHold(sd) {
  if (sd == null) return null;
  const v = Math.round(100 * clamp(1 - sd / 12));
  return { total: v, grade: grade(v), parts: { steadiness: v }, perRep: [], tSrc: {} };
}

/** Up to two plain-language suggestions about the weakest parts of a score. */
export function scoreAdvice(sc, reps, T) {
  if (!sc?.parts) return [];
  const out = [];
  const avgRange = reps.length ? mean(reps.map(repRange)) : 0;
  const avgDur = reps.length ? mean(reps.map(repDuration)) : 0;
  const sec = (ms) => (ms / 1000).toFixed(1);
  const msgs = {
    range: `Rango: llegaste a ${Math.round(avgRange)}° de media y el objetivo es ${Math.round(T.range)}° (${T.rangeSrc}). Completa más el recorrido.`,
    tempo: `Ritmo: tus repeticiones duran ${sec(avgDur)} s y lo ideal es de ${sec(T.tempoLo)} a ${sec(T.tempoHi)} s (${T.tempoSrc}).`,
    consistency: 'Constancia: el rango y el ritmo cambian mucho entre repeticiones. Busca repetir siempre el mismo recorrido.',
    technique: T.curveSrc
      ? `Técnica: la forma del movimiento se aleja de la ${T.curveSrc === 'referencias' ? 'de las referencias' : 'de tu referencia'} o tiene tirones. Hazlo fluido, sin rebotes.`
      : 'Técnica: el movimiento tiene tirones. Hazlo más fluido y sin rebotes.',
  };
  const ranked = Object.entries(sc.parts).filter(([, v]) => v != null && v < 80).sort((a, b) => a[1] - b[1]).slice(0, 2);
  for (const [k] of ranked) out.push({ part: k, text: msgs[k] });
  return out;
}
