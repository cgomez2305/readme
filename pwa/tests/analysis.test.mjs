import test from 'node:test';
import assert from 'node:assert/strict';
import {
  jointAngle, RepTracker, Smoother, AngleFilter, resample, diagnoseSet, detectFatigue, summarize, weekStart, trainingDaysInWeek, weeklyStreak,
  compareArms, painEvents, rangeTrend, setAvgRange,
} from '../js/analysis.js';
import { exerciseById, exercises, repDelta } from '../js/exercises.js';

const rep = (s, dur, mn, mx) => ({ s, e: s + dur, mn, mx });
const mk = (at, o = {}) => ({
  id: at.toISOString() + (o.arm ?? 'right'), ex: o.ex ?? 'press', arm: o.arm ?? 'right', kg: o.kg ?? 20,
  at: at.toISOString(), dur: 10000, reps: [rep(0, 2000, 80, 80 + (o.range ?? 50))], marks: [], note: '', pl: 0, ...o.extra,
});

test('jointAngle', () => {
  assert.ok(Math.abs(jointAngle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }) - 90) < 1e-9);
  assert.ok(Math.abs(jointAngle({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }) - 180) < 1e-9);
  assert.equal(jointAngle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 0);
});

// A deterministic "noise" so tests do not depend on Math.random.
const noise = (i, amp) => (((i * 7919) % 13) / 12 - 0.5) * 2 * amp;
/** Angle stream: oscillates between lo and hi with the given period, sampled at fps. */
function stream({ lo, hi, periodMs = 3000, seconds = 15, fps = 15, jitter = 0, startAtTop = true }) {
  const out = [];
  for (let i = 0, t = 0; t <= seconds * 1000; i++, t = Math.round((i * 1000) / fps)) {
    const phase = (2 * Math.PI * t) / periodMs;
    const unit = (startAtTop ? Math.cos(phase) : -Math.cos(phase)) * 0.5 + 0.5; // 1 at the top
    out.push([t, lo + (hi - lo) * unit + noise(i, jitter)]);
  }
  return out;
}
const count = (samples, delta) => {
  const t = new RepTracker(delta);
  for (const [ms, a] of samples) t.add(ms, a);
  return t;
};

test('RepTracker counts full cycles with timing and range', () => {
  const t = count(stream({ lo: 60, hi: 140 }), 20);
  assert.ok(t.reps.length >= 4 && t.reps.length <= 5, `reps ${t.reps.length}`);
  for (const r of t.reps) {
    assert.ok(Math.abs(r.e - r.s - 3000) < 250, `duration ${r.e - r.s}`);
    assert.ok(Math.abs(r.mx - r.mn - 80) < 6, `range ${r.mx - r.mn}`);
  }
});

test('works whatever the absolute angles are (a wrist that never reaches 170 degrees)', () => {
  // This is the case the old absolute thresholds missed: a real wrist moves between, say, 135 and 165.
  const wrist = count(stream({ lo: 135, hi: 165 }), 10);
  assert.ok(wrist.reps.length >= 4, `wrist reps ${wrist.reps.length}`);
  const shifted = count(stream({ lo: 135 + 15, hi: 165 + 15 }), 10);
  assert.ok(shifted.reps.length >= 4, 'a different camera position shifts the angles but not the count');
  const fromBottom = count(stream({ lo: 60, hi: 140, startAtTop: false }), 20);
  assert.ok(fromBottom.reps.length >= 4, 'starting from the bottom works too');
});

test('tolerates jitter in the angle', () => {
  const t = count(stream({ lo: 135, hi: 165, jitter: 3 }), 10);
  assert.ok(t.reps.length >= 4 && t.reps.length <= 5, `reps ${t.reps.length}`);
});

test('small wobbles and slow drifts are not repetitions', () => {
  assert.equal(count(stream({ lo: 147, hi: 153, jitter: 1 }), 10).reps.length, 0);
  const drift = Array.from({ length: 200 }, (_, i) => [i * 100, 170 - i * 0.4]);
  assert.equal(count(drift, 10).reps.length, 0);
  assert.equal(count([], 10).reps.length, 0);
});

test('fast and slow tempos are both counted', () => {
  assert.ok(count(stream({ lo: 60, hi: 140, periodMs: 1500, seconds: 12 }), 20).reps.length >= 7);
  assert.ok(count(stream({ lo: 60, hi: 140, periodMs: 6000, seconds: 30 }), 20).reps.length >= 4);
});

test('wrist average inside a rep', () => {
  const t = new RepTracker(10);
  for (const [ms, a, w] of [[0, 150, 150], [500, 110, 160], [1000, 70, 170], [1500, 110, 175], [2000, 150, 180], [2500, 112, 160], [3000, 70, 160]]) t.add(ms, a, w);
  assert.equal(t.reps.length, 1);
  assert.ok(t.reps[0].w > 150 && t.reps[0].w < 180);
});

test('delta per exercise: 30% of the default target, at least 6, scaled by the sensitivity', () => {
  assert.equal(repDelta(exerciseById('rising')), 6);
  assert.equal(repDelta(exerciseById('side_pressure')), 11);
  assert.equal(repDelta(exerciseById('side_pressure'), 'high'), 7, 'high sensitivity counts smaller movements');
  assert.equal(repDelta(exerciseById('side_pressure'), 'low'), 15);
  assert.ok(exercises.every((e) => repDelta(e) >= 6));
  assert.ok(repDelta(exerciseById('side_pressure')) < exerciseById('side_pressure').minRange / 2, 'much less than half the target');
});

test('very short cycles are noise, not repetitions', () => {
  const t = new RepTracker(6, { minMs: 400 });
  // two quick 200 ms wiggles of 20 degrees and then a real 2 s repetition
  const samples = [[0, 150], [60, 130], [120, 150], [180, 130], [240, 150]];
  for (let i = 0; i <= 30; i++) samples.push([300 + i * 66, 150 - 20 * Math.sin((Math.PI * i) / 30) * 1.0 + 20 * (i > 30 ? 1 : 0)]);
  for (const [ms, a] of samples) t.add(ms, a);
  assert.ok(t.reps.every((r) => r.e - r.s >= 400));
});

test('every repetition keeps a 24-point curve', () => {
  const t = count(stream({ lo: 60, hi: 140 }), 20);
  assert.ok(t.reps.length >= 4);
  for (const r of t.reps) {
    assert.equal(r.c.length, 24);
    assert.ok(Math.abs(r.c[0] - r.mx) < 8 && Math.abs(Math.min(...r.c) - r.mn) < 8);
  }
  assert.equal(resample([[0, 1]], 5), null);
  assert.deepEqual(resample([[0, 0], [100, 10]], 3), [0, 5, 10]);
});

test('AngleFilter removes single-frame spikes', () => {
  const f = new AngleFilter(0.5);
  const out = [100, 100, 100, 160, 100, 100].map((x) => f.push(x));
  assert.ok(Math.max(...out) < 110, `spike leaked: ${out}`);
  f.reset();
  assert.equal(f.push(50), 50);
});

test('Smoother follows the signal and can be reset', () => {
  const sm = new Smoother(0.5);
  assert.equal(sm.push(100), 100);
  assert.equal(sm.push(120), 110);
  sm.reset();
  assert.equal(sm.push(50), 50);
});

test('diagnoseSet explains why nothing was counted', () => {
  const ex = exerciseById('rising');
  const base = { reps: [] };
  assert.deepEqual(diagnoseSet({ reps: [] }, ex, 10), [], 'old sets have no detection data');
  assert.match(diagnoseSet({ ...base, cov: 0.2, obs: [150, 155] }, ex, 10)[0].title, /20%/);
  const noSwing = diagnoseSet({ ...base, cov: 0.9, obs: [150, 155] }, ex, 10);
  assert.equal(noSwing[0].title, 'El ángulo casi no cambió');
  const some = diagnoseSet({ ...base, cov: 0.9, obs: [120, 160] }, ex, 10);
  assert.equal(some[0].title, 'Hubo movimiento, pero no repeticiones completas');
  assert.equal(diagnoseSet({ reps: [1, 2, 3], cov: 0.95, obs: [100, 170] }, ex, 10).length, 0, 'a good set needs no explanation');
  assert.match(diagnoseSet({ reps: [1, 2, 3], cov: 0.65, obs: [100, 170] }, ex, 10)[0].title, /parcial/);
});

test('fatigue', () => {
  assert.equal(detectFatigue(Array.from({ length: 8 }, (_, i) => rep(i * 2500, 2500, 70, 130))), null);
  const drop = [...Array.from({ length: 4 }, (_, i) => rep(i * 2500, 2500, 70, 130)), rep(10000, 2500, 85, 130), rep(12500, 2500, 90, 130)];
  assert.equal(detectFatigue(drop), 5);
  const slow = [...Array.from({ length: 4 }, (_, i) => rep(i * 2000, 2000, 70, 130)), rep(8000, 3000, 70, 130)];
  assert.equal(detectFatigue(slow), 5);
  assert.equal(detectFatigue(Array.from({ length: 4 }, (_, i) => rep(i * 2000, 2000, 70, 130))), null);
});

test('summary tips', () => {
  const ex = exerciseById('press');
  const s = summarize(Array.from({ length: 5 }, (_, i) => rep(i * 1000, 1000, 90, 120)), ex);
  const titles = s.tips.map((t) => t.title);
  assert.ok(titles.includes('Rango corto'));
  assert.ok(titles.includes('Demasiado rápido'));
  assert.equal(summarize([rep(0, 2000, 70, 130)], ex).tips[0].level, 'info');
});

test('weekStart is Monday', () => {
  const mon = new Date(2026, 8, 28);
  assert.equal(weekStart(new Date(2026, 9, 4)).getTime(), mon.getTime());
  assert.equal(weekStart(mon).getTime(), mon.getTime());
});

test('training days and streak', () => {
  const mon = new Date(2026, 8, 28);
  const at = (days, h = 10) => new Date(2026, 8, 28 + days, h);
  const sets = [mk(at(0, 9)), mk(at(0, 18)), mk(at(2))];
  assert.equal(trainingDaysInWeek(sets, at(3)), 2);
  const now = new Date(2026, 9, 6);
  const many = [];
  for (let w = 0; w < 2; w++) for (let d = 0; d < 3; d++) many.push(mk(at(d - 7 * w)));
  assert.equal(weeklyStreak(many, 3, now), 2);
  assert.equal(weeklyStreak(many, 4, now), 0);
  void mon;
});

test('arm comparison and pain', () => {
  const now = new Date(2026, 9, 5);
  const day = (n) => new Date(now.getTime() - n * 86400000);
  const sets = [mk(day(2), { arm: 'right', range: 60 }), mk(day(3), { arm: 'left', range: 45 })];
  const c = compareArms(sets, 'press', now);
  assert.ok(c.hasBoth);
  assert.ok(Math.abs(c.rangeGapPct - 25) < 1e-9);
  const a = mk(new Date(2026, 9, 1), { extra: { pz: 'wrist', pl: 2 } });
  assert.deepEqual(painEvents([a, mk(new Date(2026, 9, 2))]), [a]);
  assert.equal(rangeTrend([mk(day(1)), mk(day(1))], 'press').length, 1);
  assert.equal(setAvgRange(sets[0]), 60);
});
