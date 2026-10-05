// Shared app state with a tiny subscribe/notify mechanism.
import { exercises, exerciseById, legacyIds } from './exercises.js';
import * as store from './store.js';

const prefs = store.loadPrefs();

// Earlier versions used other exercise ids: rename them in saved data so nothing is mislabelled.
function migrate() {
  const sets = store.loadSets();
  let changed = false;
  for (const s of sets) {
    if (legacyIds[s.ex]) { s.ex = legacyIds[s.ex]; changed = true; }
  }
  if (changed) store.saveSets(sets);
  const plan = store.loadPlan();
  let planChanged = false;
  for (const [wd, id] of Object.entries(plan.days)) {
    if (legacyIds[id]) { plan.days[wd] = legacyIds[id]; planChanged = true; }
  }
  if (planChanged) store.savePlan(plan);
  return { sets, plan };
}
const migrated = migrate();

export const state = {
  sets: migrated.sets,
  plan: migrated.plan,
  exerciseId: exerciseById(prefs.exerciseId).id,
  arm: prefs.arm === 'left' ? 'left' : 'right',
  // Selfie camera by default: you can watch the screen while you train.
  cam: prefs.cam === 'environment' ? 'environment' : 'user',
  deviceId: typeof prefs.deviceId === 'string' ? prefs.deviceId : '',
  oneRm: prefs.oneRm && typeof prefs.oneRm === 'object' ? prefs.oneRm : {},
  kg: Number.isFinite(prefs.kg) ? prefs.kg : 20,
  restSeconds: [60, 90, 120, 180].includes(prefs.restSeconds) ? prefs.restSeconds : 90,
  restLeft: null,
};

const listeners = new Set();
export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const notify = () => listeners.forEach((fn) => fn());

const persistPrefs = () =>
  store.savePrefs({
    exerciseId: state.exerciseId, arm: state.arm, kg: state.kg, restSeconds: state.restSeconds,
    cam: state.cam, deviceId: state.deviceId, oneRm: state.oneRm,
  });

export const currentExercise = () => exerciseById(state.exerciseId);

export function pickExercise(id) {
  state.exerciseId = id;
  persistPrefs();
  notify();
}
export function pickArm(arm) {
  state.arm = arm;
  persistPrefs();
  notify();
}
/** Choose the front (user) or back (environment) camera. Clears any specific lens. */
export function setCam(cam) {
  state.cam = cam === 'environment' ? 'environment' : 'user';
  state.deviceId = '';
  persistPrefs();
  notify();
}
/** Choose a specific camera lens by device id ('' = automatic). */
export function setDeviceId(id) {
  state.deviceId = id || '';
  persistPrefs();
  notify();
}
/** Saves the one-repetition max (kg) of an exercise; 0 or empty removes it. */
export function setOneRm(exId, kg) {
  const v = Math.round(Number(kg) * 2) / 2;
  if (v > 0 && v <= 500) state.oneRm = { ...state.oneRm, [exId]: v };
  else { const { [exId]: _gone, ...rest } = state.oneRm; state.oneRm = rest; }
  persistPrefs();
  notify();
}

export function setKg(kg) {
  state.kg = Math.min(500, Math.max(0, Math.round(kg * 2) / 2));
  persistPrefs();
  notify();
}
export function setRestSeconds(s) {
  state.restSeconds = s;
  persistPrefs();
  notify();
}

export function setsToday(exId) {
  const n = new Date();
  return state.sets.filter((s) => {
    const d = new Date(s.at);
    return s.ex === exId && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }).length;
}

export function todayPlanned() {
  const wd = ((new Date().getDay() + 6) % 7) + 1; // 1 = Monday
  const id = state.plan.days[wd];
  return id ? exerciseById(id) : null;
}

/** Saves a new set. media = { blob?, frames? }. Returns false if local storage is full or blocked. */
export async function addSet(set, media = {}) {
  if (media.blob) {
    await store.putVideo(set.id, media.blob);
    set.video = true;
  }
  if (media.frames?.length) await store.putFrames(set.id, media.frames);
  state.sets = [set, ...state.sets.filter((s) => s.id !== set.id)].sort((a, b) => new Date(b.at) - new Date(a.at));
  const ok = store.saveSets(state.sets);
  notify();
  cloudHook?.(set);
  return ok;
}
export async function updateSet(set) {
  const ok = store.saveSets(state.sets);
  notify();
  cloudHook?.(set);
  return ok;
}
export async function deleteSet(id) {
  state.sets = state.sets.filter((s) => s.id !== id);
  store.saveSets(state.sets);
  await store.deleteMedia(id);
  notify();
}
export function updatePlan(patch) {
  state.plan = { ...state.plan, ...patch };
  store.savePlan(state.plan);
  notify();
}

let cloudHook = null;
export const onSetSaved = (fn) => {
  cloudHook = fn;
};

// ---- rest timer ------------------------------------------------------------------------------
let restTimer = null;
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch { /* sound is optional */ }
  try { navigator.vibrate?.([250, 100, 250]); } catch { /* vibration is optional */ }
}
export function startRest() {
  clearInterval(restTimer);
  state.restLeft = state.restSeconds;
  restTimer = setInterval(() => {
    state.restLeft -= 1;
    if (state.restLeft <= 0) {
      clearInterval(restTimer);
      state.restLeft = null;
      beep();
    }
    notify();
  }, 1000);
  notify();
}
export function addRest(seconds) {
  if (state.restLeft != null) {
    state.restLeft += seconds;
    notify();
  }
}
export function cancelRest() {
  clearInterval(restTimer);
  state.restLeft = null;
  notify();
}
export { exercises };
