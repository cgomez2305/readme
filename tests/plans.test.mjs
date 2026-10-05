import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePlan, checkPlan, planCounts, GROUP, GYM_DAYS, allowedDays, prescriptionText, pctText, itemKg, weakArms,
  normalizePlan, planToStored, daysFromSessions,
} from '../js/plans.js';
import { exerciseById, freqMax, exercises } from '../js/exercises.js';

const combos = [];
for (const sparring of [true, false]) for (const days of allowedDays(sparring)) for (const week of [1, 2, 3, 4]) combos.push({ sparring, days, week });
const nonThumb = (s) => s.items.filter((i) => i.ex !== 'thumb');

test('allowed day counts', () => {
  assert.deepEqual(allowedDays(true), [3, 4, 5]);
  assert.deepEqual(allowedDays(false), [3, 4, 5, 6]);
});

test('every generated plan respects the weekly maximums', () => {
  for (const c of combos) {
    const { sessions } = generatePlan(c);
    for (const [ex, days] of Object.entries(planCounts(sessions))) {
      if (ex === 'thumb') continue;
      assert.ok(days.length <= freqMax(exerciseById(ex), c.sparring), `${JSON.stringify(c)} ${ex} on ${days.length} days`);
    }
  }
});

test('side pressure is once a week with sparring and up to twice without', () => {
  for (const days of allowedDays(true)) assert.ok(planCounts(generatePlan({ days, sparring: true }).sessions).side_pressure.length === 1);
  assert.equal(planCounts(generatePlan({ days: 6, sparring: false }).sessions).side_pressure.length, 2);
});

test('the same exercise or tendon group is never trained on consecutive days', () => {
  for (const c of combos) {
    const { sessions } = generatePlan(c);
    for (let wd = 1; wd <= 7; wd++) {
      const next = (wd % 7) + 1;
      for (const a of nonThumb(sessions[wd])) for (const b of nonThumb(sessions[next])) {
        assert.notEqual(GROUP[a.ex], GROUP[b.ex], `${JSON.stringify(c)}: ${a.ex} day ${wd} / ${b.ex} day ${next}`);
      }
    }
  }
});

test('with Sunday sparring: Saturday is rest, Monday is only light cupping and thumb', () => {
  for (const c of combos.filter((x) => x.sparring)) {
    const { sessions } = generatePlan(c);
    assert.equal(sessions[7].kind, 'sparring');
    assert.equal(sessions[6].items.length, 0, 'Saturday must be a rest day');
    for (const it of sessions[1].items) {
      assert.ok(['cup', 'thumb'].includes(it.ex), `Monday has ${it.ex}`);
      assert.ok(it.light && it.pct[0] <= 50, 'Monday work is light');
    }
  }
});

test('without sparring Sunday is a rest day and the title says so', () => {
  const { sessions } = generatePlan({ days: 6, sparring: false });
  assert.equal(sessions[7].kind, 'rest');
  assert.equal(sessions[7].title, 'Descanso');
  assert.equal(sessions[7].items.length, 0);
});

test('at most 3 exercises per session, at least one rest day, thumb on every gym day', () => {
  for (const c of combos) {
    const { sessions } = generatePlan(c);
    assert.ok(Object.values(sessions).every((s) => nonThumb(s).length <= 3));
    assert.ok(Object.values(sessions).some((s) => s.items.length === 0 && s.kind !== 'sparring'));
    const gym = GYM_DAYS[c.sparring ? 'sparring' : 'free'][c.days];
    for (const wd of gym) assert.ok(sessions[wd].items.some((i) => i.ex === 'thumb'), `thumb missing on ${wd}`);
  }
});

test('generated plans pass the guideline check with no warnings', () => {
  for (const c of combos) {
    const { sessions } = generatePlan(c);
    const warns = checkPlan(sessions, { sparring: c.sparring }).filter((x) => x.level === 'warn');
    assert.deepEqual(warns, [], JSON.stringify(c));
  }
});

test('with enough days the minimums are reached: cupping 3, finger hold 2', () => {
  const sp5 = planCounts(generatePlan({ days: 5, sparring: true }).sessions);
  assert.equal(sp5.cup.length, 3);
  assert.deepEqual(sp5.cup.slice(0, 1), [1]); // light cupping on the recovery Monday
  assert.ok(sp5.finger_hold.length >= 2);
  for (const days of [5, 6]) {
    const free = planCounts(generatePlan({ days, sparring: false }).sessions);
    assert.ok(free.cup.length >= 3 && free.finger_hold.length >= 2, `free ${days}`);
  }
});

test('intensity follows the guideline: 60% of the 1RM, side pressure 30-40%, light work 50%', () => {
  for (const c of combos) {
    for (const s of Object.values(generatePlan(c).sessions)) for (const it of s.items) {
      const e = exerciseById(it.ex);
      if (it.light) assert.deepEqual(it.pct, [50, 50]);
      else assert.deepEqual(it.pct, [e.intensity.min, e.intensity.max], `${it.ex}`);
    }
  }
  const side = generatePlan({ days: 5, sparring: true }).sessions;
  const it = Object.values(side).flatMap((s) => s.items).find((i) => i.ex === 'side_pressure');
  assert.equal(pctText(it), '30-40%');
});

test('the cycle: week 3 adds a set and the deload week cuts volume', () => {
  const sets = (week) => Object.values(generatePlan({ days: 5, sparring: true, week }).sessions).flatMap((s) => s.items).filter((i) => !i.light);
  const w1 = sets(1), w3 = sets(3), w4 = sets(4);
  assert.ok(w1.filter((i) => i.ex !== 'thumb').every((i) => i.sets === 3));
  assert.ok(w3.filter((i) => i.ex !== 'thumb').every((i) => i.sets === 4));
  assert.ok(w4.every((i) => i.sets <= 2));
  const total = (a) => a.reduce((t, i) => t + i.sets, 0);
  assert.ok(total(w4) < total(w1) * 0.7);
});

test('the weaker arm gets an extra set only on work days', () => {
  const g = generatePlan({ days: 5, sparring: true, weakArms: { rising: 'left', cup: 'right' } });
  const items = Object.values(g.sessions).flatMap((s) => s.items);
  assert.ok(items.filter((i) => i.ex === 'rising').every((i) => i.extraArm === 'left'));
  const cups = items.filter((i) => i.ex === 'cup');
  assert.ok(cups.some((i) => i.light && !i.extraArm), 'light cupping gets no extra set');
  assert.ok(cups.some((i) => !i.light && i.extraArm === 'right'));
});

test('checkPlan catches hand-made mistakes', () => {
  const mk = (days) => {
    const sessions = {};
    for (let wd = 1; wd <= 7; wd++) sessions[wd] = { kind: days[wd] ? 'train' : 'rest', items: (days[wd] ?? []).map((ex) => ({ ex, sets: 3, pct: [60, 60] })) };
    return sessions;
  };
  const text = (s, o) => checkPlan(s, o).filter((x) => x.level === 'warn').map((x) => x.text).join('\n');
  assert.match(text(mk({ 1: ['rising'], 3: ['rising'], 5: ['rising'] })), /Rising: 3 días y la guía es máx\. 2/);
  assert.match(text(mk({ 2: ['pronation'], 3: ['supination'] })), /mismo tendón en días seguidos/);
  assert.match(text(mk({ 2: ['rising'], 3: ['rising'] })), /mismo tendón en días seguidos/);
  assert.match(text(mk({ 6: ['cup'] }), { sparring: true }), /pegada al sparring/);
  assert.match(text(mk({ 2: ['side_pressure'], 5: ['side_pressure'] }), { sparring: true }), /Side pressure: 2 días y la guía es máx\. 1/);
  assert.match(text(mk({ 1: ['cup', 'rising', 'block', 'pronation'] })), /4 ejercicios/);
  const all = {};
  for (let wd = 1; wd <= 7; wd++) all[wd] = { kind: 'train', items: [{ ex: 'thumb', sets: 1, pct: [60, 60] }] };
  assert.match(text(all), /ningún día de descanso/);
  assert.equal(text(mk({ 1: ['thumb'], 2: ['thumb'], 3: ['thumb'] })), '', 'thumb every day is fine');
});

test('text and weight helpers', () => {
  assert.equal(prescriptionText({ sets: 3, reps: [8, 10] }), '3 × 8-10 reps');
  assert.equal(prescriptionText({ sets: 2, hold: [20, 30] }), '2 × 20-30 s');
  assert.deepEqual(itemKg({ pct: [60, 60] }, 40), { low: 24, high: 24 });
  assert.deepEqual(itemKg({ pct: [30, 40] }, 50), { low: 15, high: 20 });
  assert.equal(itemKg({ pct: [60, 60] }, undefined), null);
});

test('weakArms picks the weaker side from recent data', () => {
  const now = new Date(2026, 9, 5);
  const day = (n) => new Date(now.getTime() - n * 86400000).toISOString();
  const mk = (arm, range, n) => ({ id: arm + n, ex: 'rising', arm, kg: 10, at: day(n), dur: 9000, reps: [{ s: 0, e: 2000, mn: 100, mx: 100 + range }], marks: [], note: '', pl: 0 });
  assert.deepEqual(weakArms([mk('right', 30, 2), mk('left', 22, 3)], now), { rising: 'left' });
  assert.deepEqual(weakArms([mk('right', 30, 2), mk('left', 29, 3)], now), {}, 'a small gap is ignored');
  assert.deepEqual(weakArms([mk('right', 30, 2)], now), {}, 'needs both arms');
});

test('older plans (one exercise per weekday) are upgraded', () => {
  const p = normalizePlan({ goal: 3, days: { 1: 'rising', 3: 'cup' }, hour: 19, minute: 0 });
  assert.deepEqual(p.days, { 1: ['rising'], 3: ['cup'] });
  assert.equal(p.sessions[1].items[0].ex, 'rising');
  assert.equal(p.sessions[2].kind, 'rest');
  assert.equal(normalizePlan(p).sessions[3].items[0].ex, 'cup', 'idempotent');
});

test('storing a generated plan sets days, goal and sparring', () => {
  const stored = planToStored(generatePlan({ days: 5, sparring: true }), { hour: 7 });
  assert.equal(stored.goal, 5);
  assert.equal(stored.sparring, true);
  assert.equal(stored.hour, 7);
  assert.deepEqual(stored.days, daysFromSessions(stored.sessions));
  assert.equal(stored.program.name, 'Semana con sparring');
  assert.ok(!stored.days[6] && !stored.days[7]);
  assert.equal(exercises.length, 9);
});
