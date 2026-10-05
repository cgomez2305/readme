// Weekly training plans. Pure code (no DOM), so it can be tested.
//
// Rules that every generated plan follows:
//  - Frequency: no exercise goes over its weekly maximum (side pressure: 1 when there is sparring, else 2;
//    cupping aims for 3, finger hold for 2). Intensity: 60% of the 1RM, side pressure 30-40%.
//  - Tendon recovery (our rules on top of the coach's numbers):
//      * the same exercise, or the same tendon group, is never trained on two consecutive days
//        (the thumb is exempt: it can be trained every day);
//      * with Sunday sparring, Sunday counts as a hard day for every group, so Saturday is a full rest day
//        and Monday only has light work (cupping at low intensity and the thumb);
//      * at most 3 exercises per session, and at least one day without any work;
//      * every cycle ends with a deload week (fewer sets). Nothing is ever trained to failure.
//  - Sets, reps, rest and the 4-week cycle are general suggestions of ours, not from the coach.
import { exerciseById, freqMax, recommendedKg } from './exercises.js';
import { compareArms } from './analysis.js';

/** Tendon groups: the same group is not trained on consecutive days. */
export const GROUP = {
  rising: 'deviators', wrist_adduction: 'deviators',
  pronation: 'rotators', supination: 'rotators',
  cup: 'flexors', finger_hold: 'fingers',
  side_pressure: 'elbow', block: 'elbow',
  thumb: 'thumb',
};
export const GROUP_LABEL = {
  deviators: 'Muñeca (lateral)', rotators: 'Antebrazo (rotación)', flexors: 'Muñeca (flexión)', fingers: 'Dedos', elbow: 'Codo y hombro', thumb: 'Pulgar',
};

/** Suggested work per exercise: sets, reps or hold seconds, rest in seconds. */
const BASE = {
  rising: { sets: 3, reps: [8, 10], rest: 90 },
  pronation: { sets: 3, reps: [8, 10], rest: 90 },
  supination: { sets: 3, reps: [8, 10], rest: 90 },
  cup: { sets: 3, reps: [10, 12], rest: 60 },
  wrist_adduction: { sets: 3, reps: [10, 12], rest: 90 },
  finger_hold: { sets: 3, hold: [20, 30], rest: 90 },
  thumb: { sets: 2, hold: [20, 30], rest: 60 },
  side_pressure: { sets: 3, reps: [8, 10], rest: 90 },
  block: { sets: 3, reps: [8, 10], rest: 90 },
};

/**
 * Order in which weekly sessions are placed, as [exercise, how many days]. The ones with a weekly minimum
 * come first. Each exercise is placed on the best set of days at once, so spacing works out (e.g. Mon-Wed-Fri).
 */
const ORDER = [
  ['cup', 3], ['finger_hold', 2], ['side_pressure', 1], ['rising', 1], ['pronation', 1], ['supination', 1],
  ['block', 1], ['wrist_adduction', 1],
  ['rising', 2], ['pronation', 2], ['supination', 2], ['block', 2], ['wrist_adduction', 2], ['side_pressure', 2],
];

/** Gym days (1 = Monday) for each combination. Sunday (7) is sparring or rest. */
export const GYM_DAYS = {
  sparring: { 3: [2, 3, 5], 4: [2, 3, 4, 5], 5: [1, 2, 3, 4, 5] },
  free: { 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] },
};
export const allowedDays = (sparring) => Object.keys(GYM_DAYS[sparring ? 'sparring' : 'free']).map(Number);
export const CYCLE = ['Semana 1', 'Semana 2', 'Semana 3', 'Descarga'];
const MAX_PER_SESSION = 3;
const SPARRING_DAY = 7;

const cyc = (a, b) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b)); // distance between weekdays, week wraps around

function setsFor(ex, week, light) {
  const base = BASE[ex].sets;
  if (week === 4) return ex === 'thumb' ? 1 : Math.max(1, Math.round(base * 0.6)); // deload: about 40% fewer sets
  if (light) return 2;
  if (week === 3) return base + 1;
  return base;
}

function makeItem(ex, week, light) {
  const b = BASE[ex], e = exerciseById(ex);
  const item = { ex, sets: setsFor(ex, week, light), rest: b.rest };
  if (b.reps) item.reps = b.reps; else item.hold = b.hold;
  item.pct = light ? [50, 50] : [e.intensity.min, e.intensity.max];
  if (light) item.light = true;
  return item;
}

/**
 * Builds a week.
 * @param {{days?:number, sparring?:boolean, week?:number, weakArms?:Record<string,'left'|'right'>}} o
 *   week: 1..4 (4 = deload). weakArms: exercise id -> the weaker arm, which gets one extra set.
 */
export function generatePlan({ days = 5, sparring = true, week = 1, weakArms = {} } = {}) {
  const table = GYM_DAYS[sparring ? 'sparring' : 'free'];
  const n = table[days] ? days : Math.max(...Object.keys(table).map(Number));
  const gym = table[n];
  const sessions = {};
  for (let wd = 1; wd <= 7; wd++) sessions[wd] = { kind: 'rest', items: [] };
  if (sparring) sessions[SPARRING_DAY].kind = 'sparring';
  const light = (wd) => sparring && wd === 1; // the day after sparring is a recovery day
  for (const wd of gym) sessions[wd].kind = light(wd) ? 'recovery' : 'train';

  const placed = {}; // ex -> days
  const items = (wd) => sessions[wd].items.filter((i) => i.ex !== 'thumb');
  const allowed = (wd, ex) => {
    const s = sessions[wd];
    if (s.kind === 'rest' || s.kind === 'sparring') return false;
    if (light(wd) && ex !== 'cup') return false;
    if (items(wd).length >= MAX_PER_SESSION || s.items.some((i) => i.ex === ex)) return false;
    if ((placed[ex] ?? []).length >= freqMax(exerciseById(ex), sparring)) return false;
    for (const d of [((wd + 5) % 7) + 1, (wd % 7) + 1]) { // the day before and the day after
      if (d === SPARRING_DAY && sparring && !light(wd)) return false; // sparring is hard for every group (light recovery work is fine)
      if (sessions[d].items.some((i) => i.ex !== 'thumb' && (i.ex === ex || GROUP[i.ex] === GROUP[ex]))) return false;
    }
    return true;
  };
  const score = (wd, ex) => {
    const sameGroup = items(wd).some((i) => GROUP[i.ex] === GROUP[ex]) ? 1 : 0;
    return -items(wd).length * 2 + sameGroup - wd * 0.01;
  };
  /** Best subset of days (up to `want`) where ex can go, with no two of them on consecutive days. */
  const bestDays = (ex, want) => {
    const cands = gym.filter((wd) => allowed(wd, ex));
    let best = [], bestScore = -Infinity;
    const walk = (i, chosen) => {
      const spacing = chosen.length > 1 ? Math.min(...chosen.flatMap((a, x) => chosen.slice(x + 1).map((b) => cyc(a, b)))) : 7;
      const val = chosen.length * 100 + Math.min(spacing, 4) * 5 + chosen.reduce((t, wd) => t + score(wd, ex), 0);
      if (chosen.length && val > bestScore) { best = [...chosen]; bestScore = val; }
      if (chosen.length >= want) return;
      for (let k = i; k < cands.length; k++) {
        if (chosen.every((wd) => cyc(wd, cands[k]) > 1)) walk(k + 1, [...chosen, cands[k]]);
      }
    };
    walk(0, []);
    return best;
  };
  for (const [ex, total] of ORDER) {
    const have = (placed[ex] ?? []).length;
    const want = Math.min(total, freqMax(exerciseById(ex), sparring)) - have;
    if (want <= 0) continue;
    for (const wd of bestDays(ex, want)) {
      sessions[wd].items.push(makeItem(ex, week, light(wd)));
      (placed[ex] ??= []).push(wd);
    }
  }
  // The thumb can be trained every day: a short light add-on on every gym day.
  for (const wd of gym) sessions[wd].items.push(makeItem('thumb', week, light(wd)));

  for (const wd of gym) {
    const s = sessions[wd];
    s.items.sort((a, b) => (a.ex === 'thumb') - (b.ex === 'thumb')); // thumb last
    // The weaker arm gets one extra set.
    for (const it of s.items) {
      if (weakArms[it.ex] && !it.light) it.extraArm = weakArms[it.ex];
    }
    const groups = [...new Set(s.items.filter((i) => i.ex !== 'thumb').map((i) => GROUP[i.ex]))];
    s.title = s.kind === 'recovery' ? 'Recuperación' : groups.length ? groups.slice(0, 2).map((g) => GROUP_LABEL[g]).join(' + ') : 'Entrenamiento';
  }
  sessions[SPARRING_DAY].title = sparring ? 'Sparring' : 'Descanso';
  for (let wd = 1; wd <= 7; wd++) {
    const s = sessions[wd];
    if (s.kind === 'rest' && wd !== SPARRING_DAY) s.title = 'Descanso';
    s.note = sessionNote(s, wd, sparring);
  }
  return { params: { days: n, sparring, week }, sessions };
}

function sessionNote(s, wd, sparring) {
  if (s.kind === 'sparring') return 'Calienta 10 minutos y para si un tendón duele. Sin ir al máximo.';
  if (s.kind === 'recovery') return 'Día después del sparring: carga ligera. Si notas molestia en los tendones, descansa.';
  if (s.kind === 'train') return 'Calienta con 2 series ligeras. Termina cada serie con 2 repeticiones en reserva: nunca al fallo.';
  if (sparring && wd === 6) return 'Descanso total antes del sparring. Movilidad suave, hidratación y buen sueño.';
  return wd === 7 ? 'Descanso. Los tendones se adaptan más despacio que el músculo.' : 'Descanso o movilidad suave.';
}

// ---- checks -------------------------------------------------------------------------------------
/** Training days of each exercise in a sessions object. */
export function planCounts(sessions) {
  const out = {};
  for (let wd = 1; wd <= 7; wd++) {
    for (const it of sessions[wd]?.items ?? []) (out[it.ex] ??= []).push(wd);
  }
  return out;
}

/**
 * Checks a plan against the guidelines. Returns [{ ok, level:'good'|'warn'|'info', text }].
 * Works on any sessions object, including hand-edited ones.
 */
export function checkPlan(sessions, { sparring = false } = {}) {
  const out = [];
  const counts = planCounts(sessions);
  for (const id of Object.keys(BASE)) {
    const e = exerciseById(id), days = counts[id]?.length ?? 0, max = freqMax(e, sparring), min = e.perWeek.min;
    if (id === 'thumb') continue;
    if (days > max) out.push({ ok: false, level: 'warn', text: `${e.name}: ${days} días y la guía es máx. ${max}.` });
    else if (min && days < min) out.push({ ok: true, level: 'info', text: `${e.name}: ${days} ${days === 1 ? 'día' : 'días'}; la guía es ${min} a ${e.perWeek.max}. Hay pocos días para llegar.` });
    else if (days > 0) out.push({ ok: true, level: 'good', text: `${e.name}: ${days} ${days === 1 ? 'día' : 'días'} (máx. ${max}).` });
  }
  // consecutive days with the same exercise or tendon group
  const seen = new Set();
  for (let wd = 1; wd <= 7; wd++) {
    const next = (wd % 7) + 1;
    if (sparring && (wd === SPARRING_DAY || next === SPARRING_DAY)) {
      const other = wd === SPARRING_DAY ? next : wd;
      const heavy = (sessions[other]?.items ?? []).filter((i) => i.ex !== 'thumb' && !(i.light && other === 1));
      if (heavy.length) {
        const key = `s${other}`;
        if (!seen.has(key)) { seen.add(key); out.push({ ok: false, level: 'warn', text: `Carga pesada pegada al sparring (${dayName(other)}). Mejor descanso o solo trabajo ligero.` }); }
      }
      continue;
    }
    for (const a of sessions[wd]?.items ?? []) {
      for (const b of sessions[next]?.items ?? []) {
        if (a.ex === 'thumb' || b.ex === 'thumb') continue;
        if (a.ex === b.ex || GROUP[a.ex] === GROUP[b.ex]) {
          const key = `${wd}${a.ex}${b.ex}`;
          if (!seen.has(key)) { seen.add(key); out.push({ ok: false, level: 'warn', text: `${exerciseById(a.ex).name} (${dayName(wd)}) y ${exerciseById(b.ex).name} (${dayName(next)}) cargan el mismo tendón en días seguidos.` }); }
        }
      }
    }
  }
  for (let wd = 1; wd <= 7; wd++) {
    const n = (sessions[wd]?.items ?? []).filter((i) => i.ex !== 'thumb').length;
    if (n > MAX_PER_SESSION) out.push({ ok: false, level: 'warn', text: `${dayName(wd)}: ${n} ejercicios. Mejor máx. ${MAX_PER_SESSION} por sesión.` });
  }
  const restDays = [1, 2, 3, 4, 5, 6, 7].filter((wd) => !(sessions[wd]?.items?.length) && sessions[wd]?.kind !== 'sparring').length;
  if (restDays < 1) out.push({ ok: false, level: 'warn', text: 'No hay ningún día de descanso completo.' });
  else out.push({ ok: true, level: 'good', text: `${restDays} ${restDays === 1 ? 'día' : 'días'} de descanso completo.` });
  return out;
}

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const dayName = (wd) => DAY_NAMES[wd - 1];

// ---- text helpers -----------------------------------------------------------------------------
/** "3 × 8-10 reps" or "3 × 20-30 s". */
export function prescriptionText(it) {
  const range = (r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}-${r[1]}`);
  return it.reps ? `${it.sets} × ${range(it.reps)} reps` : `${it.sets} × ${range(it.hold)} s`;
}
export const pctText = (it) => (it.pct[0] === it.pct[1] ? `${it.pct[0]}%` : `${it.pct[0]}-${it.pct[1]}%`);

/** Working weight in kg for an item given the user's 1RM, or null. */
export function itemKg(it, oneRm) {
  if (!(oneRm > 0)) return null;
  const lo = (oneRm * it.pct[0]) / 100, hi = (oneRm * it.pct[1]) / 100;
  const r = (v) => Math.round(v * 2) / 2;
  return { low: r(lo), high: r(hi) };
}

/** Weaker arm per exercise (range or hold time, last 30 days) when the gap is at least 8%. */
export function weakArms(sets, now = new Date()) {
  const out = {};
  for (const id of Object.keys(BASE)) {
    const c = compareArms(sets, id, now, 30, id === 'finger_hold' || id === 'thumb');
    if (c.hasBoth && Math.abs(c.rangeGapPct) >= 8) out[id] = c.rangeGapPct > 0 ? 'left' : 'right';
  }
  return out;
}

// ---- storing a plan in the app's plan object ----------------------------------------------------
/** Derived `days` (weekday -> exercise ids) from sessions, so the rest of the app can read the plan simply. */
export function daysFromSessions(sessions) {
  const days = {};
  for (let wd = 1; wd <= 7; wd++) {
    const ids = (sessions[wd]?.items ?? []).map((i) => i.ex);
    if (ids.length) days[wd] = ids;
  }
  return days;
}

/** A fresh item for an exercise, for hand-made edits. */
export const newItem = (ex, week = 1, light = false) => makeItem(ex, week, light);

/** Replaces the exercises of one day (keeping the items that stay), and fixes its kind, title and note. */
export function setSessionExercises(session, ids, { week = 1, wd = 1, sparring = false } = {}) {
  const keep = new Map(session.items.map((i) => [i.ex, i]));
  const items = ids.map((ex) => keep.get(ex) ?? newItem(ex, week, sparring && wd === 1));
  items.sort((a, b) => (a.ex === 'thumb') - (b.ex === 'thumb'));
  const kind = session.kind === 'sparring' ? 'sparring' : items.length ? (sparring && wd === 1 ? 'recovery' : 'train') : 'rest';
  const groups = [...new Set(items.filter((i) => i.ex !== 'thumb').map((i) => GROUP[i.ex]))];
  const title = kind === 'sparring' ? 'Sparring' : kind === 'recovery' ? 'Recuperación'
    : groups.length ? groups.slice(0, 2).map((g) => GROUP_LABEL[g]).join(' + ') : items.length ? 'Entrenamiento' : 'Descanso';
  return { ...session, kind, title, items, note: sessionNote({ kind }, wd, sparring) };
}

/** Makes sure a stored plan has `sessions` and array-valued `days` (older versions saved one id per day). */
export function normalizePlan(plan) {
  const p = { ...plan };
  const days = {};
  for (const [wd, v] of Object.entries(p.days ?? {})) days[wd] = Array.isArray(v) ? v : [v];
  if (!p.sessions) {
    p.sessions = {};
    for (let wd = 1; wd <= 7; wd++) {
      const ids = days[wd] ?? [];
      p.sessions[wd] = { kind: ids.length ? 'train' : 'rest', title: ids.length ? 'Entrenamiento' : 'Descanso', note: '', items: ids.map((ex) => makeItem(ex, 1, false)) };
    }
  }
  p.days = days;
  return p;
}

export function emptySessions() {
  const s = {};
  for (let wd = 1; wd <= 7; wd++) s[wd] = { kind: 'rest', title: 'Descanso', note: '', items: [] };
  return s;
}

/** Number of days with gym work (sparring not counted). */
export const gymDayCount = (sessions) => Object.values(sessions).filter((s) => s.kind === 'train' || s.kind === 'recovery').length;

export function planToStored(generated, base = {}) {
  const gym = gymDayCount(generated.sessions);
  return {
    ...base,
    sessions: generated.sessions,
    days: daysFromSessions(generated.sessions),
    goal: gym,
    sparring: generated.params.sparring,
    program: { ...generated.params, name: generated.params.sparring ? 'Semana con sparring' : 'Semana sin sparring' },
  };
}
export { recommendedKg };
