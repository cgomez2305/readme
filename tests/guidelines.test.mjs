import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exercises, exerciseById, freqMax, freqText, intensityText, recommendedKg, intensityStatus, isHold, legacyIds,
} from '../js/exercises.js';
import {
  weeklyDaysFor, summarizeHold, intensityTips, frequencyTips, holdTrend, compareArms, trainingDaysInWeek,
} from '../js/analysis.js';

const byId = (id) => exercises.find((e) => e.id === id);
const set = (at, o = {}) => ({
  id: at.toISOString() + (o.arm ?? 'right') + (o.ex ?? 'rising'), ex: o.ex ?? 'rising', arm: o.arm ?? 'right', kg: o.kg ?? 20,
  at: at.toISOString(), dur: o.dur ?? 10000, reps: o.reps ?? [], marks: [], note: '', pl: 0,
});

test('the exercise list follows the coach guidelines', () => {
  assert.deepEqual(exercises.map((e) => e.id), [
    'rising', 'pronation', 'supination', 'cup', 'wrist_adduction', 'finger_hold', 'thumb', 'side_pressure', 'block',
  ]);
  assert.equal(freqMax(byId('rising')), 2);
  assert.equal(freqMax(byId('pronation')), 2);
  assert.equal(freqMax(byId('supination')), 2);
  assert.equal(freqMax(byId('wrist_adduction')), 2);
  assert.equal(freqMax(byId('block')), 2);
  assert.equal(freqMax(byId('cup')), 4);
  assert.equal(byId('cup').perWeek.min, 3);
  assert.equal(freqMax(byId('finger_hold')), 3);
  assert.equal(byId('finger_hold').perWeek.min, 2);
  assert.ok(freqMax(byId('thumb')) >= 7, 'thumb can be trained every day');
});

test('side pressure drops to once a week when there is sparring', () => {
  const side = byId('side_pressure');
  assert.equal(freqMax(side, false), 2);
  assert.equal(freqMax(side, true), 1);
  assert.match(freqText(side, true), /1 vez por semana si hay sparring/);
  assert.equal(freqMax(byId('rising'), true), 2, 'sparring only affects side pressure');
});

test('frequency text', () => {
  assert.equal(freqText(byId('rising')), 'Máx. 2 veces por semana');
  assert.equal(freqText(byId('cup')), '3 a 4 veces por semana (según la intensidad)');
  assert.equal(freqText(byId('finger_hold')), '2 a 3 veces por semana');
  assert.match(freqText(byId('thumb')), /todos los días/);
});

test('intensity is 60% of the 1RM, side pressure 30-40%', () => {
  assert.equal(intensityText(byId('rising')), '60% del 1RM');
  assert.equal(intensityText(byId('side_pressure')), '30-40% del 1RM');
  assert.deepEqual(recommendedKg(byId('rising'), 50), { low: 30, high: 30 });
  assert.deepEqual(recommendedKg(byId('side_pressure'), 50), { low: 15, high: 20 });
  assert.equal(recommendedKg(byId('rising'), 0), null);
});

test('intensity status flags weights that are too heavy and never the maximum', () => {
  const rising = byId('rising');
  assert.equal(intensityStatus(rising, 30, 50), 'ok');
  assert.equal(intensityStatus(rising, 33, 50), 'ok'); // up to 10% over the top is tolerated
  assert.equal(intensityStatus(rising, 36, 50), 'high');
  assert.equal(intensityStatus(rising, 46, 50), 'max'); // 92% of the 1RM
  assert.equal(intensityStatus(rising, 30, undefined), null);
  const side = byId('side_pressure');
  assert.equal(intensityStatus(side, 30, 50), 'high'); // 60% is too heavy for side pressure
  assert.equal(intensityStatus(side, 18, 50), 'ok');
});

test('intensity tips', () => {
  const rising = byId('rising');
  assert.equal(intensityTips(rising, 30, 50)[0].level, 'good');
  const high = intensityTips(rising, 38, 50)[0];
  assert.equal(high.level, 'warn');
  assert.match(high.text, /60% del 1RM/);
  const max = intensityTips(rising, 48, 50)[0];
  assert.equal(max.title, 'Cerca de tu máximo');
  assert.match(max.text, /No entrenes al máximo/);
  assert.deepEqual(intensityTips(rising, 30, undefined), []);
});

test('weekly days per exercise and frequency warning', () => {
  const mon = new Date(2026, 8, 28, 10);
  const at = (d) => new Date(2026, 8, 28 + d, 10);
  const sets = [set(mon), set(new Date(2026, 8, 28, 18)), set(at(2)), set(at(4)), set(at(1), { ex: 'cup' })];
  assert.equal(weeklyDaysFor(sets, 'rising', at(5)), 3); // two sets on Monday count as one day
  assert.equal(weeklyDaysFor(sets, 'cup', at(5)), 1);
  assert.equal(weeklyDaysFor(sets, 'rising', at(8)), 0, 'next week starts fresh');
  const rising = byId('rising');
  assert.equal(frequencyTips(rising, 2).length, 0);
  assert.equal(frequencyTips(rising, 3)[0].title, 'Frecuencia semanal superada');
  assert.equal(frequencyTips(byId('side_pressure'), 2, true).length, 1);
  assert.equal(frequencyTips(byId('thumb'), 6).length, 0);
  assert.equal(trainingDaysInWeek(sets, at(5)), 4);
});

test('hold exercises', () => {
  assert.ok(isHold(byId('finger_hold')));
  assert.ok(isHold(byId('thumb')));
  assert.ok(!isHold(byId('rising')));
  assert.equal(summarizeHold(3000, 2).tips[0].title, 'Tiempo corto');
  assert.equal(summarizeHold(20000, 3).tips.at(-1).title, 'Muñeca firme');
  assert.equal(summarizeHold(20000, 8).tips.at(-1).title, 'Muñeca algo inestable');
  const bad = summarizeHold(20000, 14).tips.at(-1);
  assert.equal(bad.level, 'warn');
  assert.match(bad.text, /fallo/);
  assert.equal(summarizeHold(20000, undefined).tips.length, 1);
});

test('hold trend and arm comparison use time under tension', () => {
  const now = new Date(2026, 9, 5, 12);
  const day = (n) => new Date(now.getTime() - n * 86400000);
  const sets = [
    set(day(1), { ex: 'finger_hold', arm: 'right', dur: 30000 }),
    set(day(2), { ex: 'finger_hold', arm: 'left', dur: 24000 }),
    set(day(1), { ex: 'finger_hold', arm: 'right', dur: 20000 }),
  ];
  assert.deepEqual(holdTrend(sets, 'finger_hold').map((p) => p.value), [24, 25]);
  const c = compareArms(sets, 'finger_hold', now, 30, true);
  assert.ok(c.hasBoth);
  assert.equal(c.rightRange, 25);
  assert.equal(c.leftRange, 24);
});

test('old exercise ids still resolve', () => {
  assert.equal(legacyIds.press, 'side_pressure');
  assert.equal(exerciseById('press').id, 'side_pressure');
  assert.equal(exerciseById('back_pressure').id, 'block');
  assert.equal(exerciseById('nonsense').id, exercises[0].id);
});
