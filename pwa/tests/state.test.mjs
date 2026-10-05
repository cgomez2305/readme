import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser storage stub (state.js reads localStorage when it is imported).
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { generatePlan, planToStored } = await import('../js/plans.js');
const weekday = ((new Date().getDay() + 6) % 7) + 1;
mem.set('fulcro.plan.v1', JSON.stringify(planToStored(generatePlan({ days: 6, sparring: false }))));

const st = await import('../js/state.js');
const { setsInDay, setsInWeek, weekStart } = await import('../js/analysis.js');

const set = (id, at, ex = 'rising') => ({ id, ex, arm: 'right', kg: 10, at: at.toISOString(), dur: 9000, reps: [], marks: [], note: '', pl: 0 });
const now = new Date();
const monday = weekStart(now);
const at = (offsetDays, h = 10) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offsetDays, h);

test('plan helpers: the day session, the planned item and the next exercise', () => {
  assert.ok(st.hasPlan());
  const s = st.todaySession();
  assert.equal(s, st.state.plan.sessions[weekday]);
  if (s.items.length) {
    const first = s.items[0].ex;
    assert.equal(st.plannedItemFor(first).ex, first);
    assert.equal(st.todayPlanned().id, first, 'the first exercise with sets pending');
    const other = ['rising', 'pronation', 'supination', 'cup', 'wrist_adduction', 'finger_hold', 'thumb', 'side_pressure', 'block'].find((e) => !s.items.some((i) => i.ex === e));
    if (other) assert.equal(st.plannedItemFor(other), null, 'not planned today');
  } else {
    assert.equal(st.todayPlanned(), null);
  }
});

test('delete one set, a day and a whole week; the cloud hook gets the ids', async () => {
  const deleted = [];
  st.onSetsDeleted((ids) => deleted.push(...ids));
  const sets = [set('a', at(0)), set('b', at(0, 18)), set('c', at(2)), set('old', at(-3))];
  for (const x of sets) await st.addSet({ ...x });
  assert.equal(st.state.sets.length, 4);
  assert.equal(setsInDay(st.state.sets, at(0)).length, 2);
  assert.equal(setsInWeek(st.state.sets, at(3)).length, 3, 'the old set belongs to the previous week');

  await st.deleteSet('b');
  assert.deepEqual(st.state.sets.map((s) => s.id).sort(), ['a', 'c', 'old']);
  assert.deepEqual(deleted, ['b']);

  const thisWeek = setsInWeek(st.state.sets, at(3)).map((s) => s.id);
  await st.deleteSets(thisWeek);
  assert.deepEqual(st.state.sets.map((s) => s.id), ['old'], 'only the previous week is left');
  assert.deepEqual(deleted.sort(), ['a', 'b', 'c']);
  assert.equal(JSON.parse(mem.get('fulcro.sets.v1')).length, 1, 'saved, so it survives a reload');
  await st.deleteSets(['does-not-exist']); // harmless
  assert.equal(st.state.sets.length, 1);
});

test('clearing the plan keeps the rest of the settings', () => {
  st.updatePlan({ hour: 7 });
  st.clearPlan();
  assert.ok(!st.hasPlan());
  assert.equal(st.state.plan.hour, 7);
  assert.equal(st.todaySession().items.length, 0);
  assert.equal(st.state.plan.program, undefined);
});
