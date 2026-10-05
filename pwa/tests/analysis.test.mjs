import test from 'node:test';
import assert from 'node:assert/strict';
import {
  jointAngle, RepTracker, detectFatigue, summarize, weekStart, trainingDaysInWeek, weeklyStreak,
  compareArms, painEvents, rangeTrend, setAvgRange,
} from '../js/analysis.js';
import { exerciseById } from '../js/exercises.js';

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

test('RepTracker counts cycles with timing and range', () => {
  const t = new RepTracker(120, 70);
  for (const [ms, a] of [[0, 150], [200, 110], [400, 60], [600, 100], [800, 130], [1000, 150], [1200, 100], [1400, 55], [1600, 125]]) t.add(ms, a);
  assert.equal(t.reps.length, 2);
  assert.equal(t.reps[0].s, 200);
  assert.equal(t.reps[0].e, 800);
  assert.equal(t.reps[0].mn, 60);
  assert.equal(t.reps[0].mx, 150);
  assert.equal(t.reps[1].mn, 55);
});

test('partial moves are not reps', () => {
  const t = new RepTracker(120, 70);
  for (const [ms, a] of [[0, 150], [200, 100], [400, 90], [600, 140]]) t.add(ms, a);
  assert.equal(t.reps.length, 0);
});

test('wrist average inside a rep', () => {
  const t = new RepTracker(120, 70);
  t.add(0, 150); t.add(100, 100, 160); t.add(200, 60, 170); t.add(300, 130, 180);
  assert.ok(Math.abs(t.reps[0].w - 170) < 1e-9);
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
