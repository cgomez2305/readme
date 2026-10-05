import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const S = await import('../js/score.js');
const A = await import('../js/analysis.js');
const E = await import('../js/exercises.js');
const st = await import('../js/state.js');
const M = await import('../js/model.js');
const { rng } = await import('../js/nn.js');

const ex = E.exerciseById('rising');

/** A repetition as the tracker produces it: peak -> valley -> peak over `dur` ms. */
function rep({ range = 30, dur = 2500, base = 150, jitter = 0, seed = 1, shape = 'smooth' }) {
  const r = rng(seed);
  const t = new A.RepTracker(6);
  const n = Math.round(dur / 66) + 20;
  for (let i = 0; i <= n; i++) {
    const tt = i * 66, ph = (2 * Math.PI * tt) / dur;
    let a = base + (range / 2) * Math.cos(ph) + (r() - 0.5) * 2 * jitter;
    if (shape === 'stutter') a = base + (range / 2) * Math.cos(ph) + 0.35 * range * Math.sin(5 * ph);
    t.add(tt, a);
  }
  return t.reps[0];
}
const reps = (n, o) => Array.from({ length: n }, (_, i) => rep({ ...o, seed: (o.seed ?? 1) + i }));

test('percentile and correlation basics', () => {
  assert.equal(S.percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(S.percentile([10], 0.9), 10);
  assert.ok(Math.abs(S.correlation([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
  assert.ok(S.correlation([1, 2, 3, 4], [4, 3, 2, 1]) < -0.99);
  assert.equal(S.correlation([1, 1, 1], [1, 2, 3]), 0);
});

test('scores follow the quality of the execution', () => {
  const T = S.resolveTargets(ex, []);
  const good = S.scoreSet(reps(5, { range: 30 }), T);
  const small = S.scoreSet(reps(5, { range: 9 }), T);
  const fast = S.scoreSet(reps(5, { range: 30, dur: 700 }), T);
  assert.ok(good.total >= 90 && good.grade === 'Excelente', `good ${good.total}`);
  assert.ok(small.total < good.total - 10 && small.parts.range < 70, `small ${small.total}`);
  assert.ok(fast.total < good.total - 25 && fast.parts.tempo < 30, `fast ${fast.total}`);
  assert.equal(good.perRep.length, 5);
  assert.equal(S.scoreSet([], T), null);
  assert.equal(S.grade(95), 'Excelente'); assert.equal(S.grade(80), 'Buena'); assert.equal(S.grade(60), 'Mejorable'); assert.equal(S.grade(30), 'Floja');
});

test('with no references the default targets are used, and they are not demanding', () => {
  const T = S.resolveTargets(ex, []);
  assert.equal(T.range, ex.minRange);
  assert.equal(T.rangeSrc, 'objetivo por defecto');
  assert.ok(ex.minRange <= 25, 'the defaults no longer ask for large angles');
  for (const e of E.exercises.filter((x) => x.mode === 'reps')) assert.ok(e.minRange <= 35, e.id);
  // a modest, real wrist movement of 18 degrees already counts as complete
  const set = S.scoreSet(reps(4, { range: 18 }), T);
  assert.ok(set.parts.range >= 100 - 1, `range part ${set.parts.range}`);
});

test('range and tempo targets come from the user\'s own reference first, then other athletes, then the defaults', () => {
  const mk = (source, range, dur) => ({ id: source + range, ex: 'rising', arm: 'right', source, label: 'x', at: '2026-10-01', reps: S.toRefReps(reps(5, { range, dur })) });
  const pro = mk('pro', 40, 2000), own = mk('own', 20, 3000);
  const onlyPro = S.resolveTargets(ex, [pro]);
  assert.equal(onlyPro.rangeSrc, 'referencias');
  assert.ok(onlyPro.range > 25 && onlyPro.range < 40, `pro p25*0.8 = ${onlyPro.range}`);
  assert.ok(onlyPro.curve && onlyPro.curveSrc === 'referencias');
  const both = S.resolveTargets(ex, [pro, own]);
  assert.equal(both.rangeSrc, 'tu referencia');
  assert.ok(Math.abs(both.range - 20 * 0.85) < 2, `own target ${both.range}`);
  assert.equal(both.curveSrc, 'referencias', 'the shape still follows the athletes');
  assert.ok(both.tempoLo > 2000 && both.tempoHi > 3500, 'the tempo band follows the own reference');
  assert.equal(S.resolveTargets(ex, [{ ...pro, reps: pro.reps.slice(0, 2) }]).rangeSrc, 'objetivo por defecto', 'needs at least 3 reps');
  assert.equal(S.resolveTargets(E.exerciseById('cup'), [pro]).rangeSrc, 'objetivo por defecto', 'references of another exercise do not apply');
});

test('a movement that matches the reference shape scores higher than a jerky one', () => {
  const ref = { id: 'r', ex: 'rising', arm: 'right', source: 'pro', label: 'x', at: '2026-10-01', reps: S.toRefReps(reps(6, { range: 30 })) };
  const T = S.resolveTargets(ex, [ref]);
  const smooth = S.scoreSet(reps(4, { range: 30, seed: 50 }), T);
  const jerky = S.scoreSet(reps(4, { range: 30, seed: 60, shape: 'stutter' }), T);
  assert.ok(smooth.parts.technique > jerky.parts.technique + 15, `${smooth.parts.technique} vs ${jerky.parts.technique}`);
  assert.equal(S.wobbles(reps(1, { range: 30 })[0].c), 0, 'a clean repetition has no extra reversals');
  // a double dip inside one repetition: down, a bounce up, down again, then up
  const dip = [100, 90, 80, 70, 60, 65, 70, 64, 58, 63, 75, 90, 100, 110, 120, 130, 140, 150, 150, 150, 150, 150, 150, 150];
  assert.ok(S.wobbles(dip) >= 2);
  assert.ok(reps(1, { range: 30, shape: 'stutter' }).length >= 1);
});

test('advice names the weakest parts', () => {
  const T = S.resolveTargets(ex, []);
  const rs = reps(5, { range: 9, dur: 700 });
  const sc = S.scoreSet(rs, T);
  const advice = S.scoreAdvice(sc, rs, T);
  assert.ok(advice.length >= 1 && advice.length <= 2);
  assert.ok(advice.some((a) => a.part === 'range' || a.part === 'tempo'));
  assert.deepEqual(S.scoreAdvice(S.scoreSet(reps(5, { range: 30 }), T), reps(5, { range: 30 }), T), [], 'nothing to fix on a great set');
});

test('hold score is the wrist steadiness', () => {
  assert.equal(S.scoreHold(0).total, 100);
  assert.equal(S.scoreHold(6).total, 50);
  assert.equal(S.scoreHold(20).total, 0);
  assert.equal(S.scoreHold(null), null);
});

test('training the technique model: needs data, then scores good executions above bad ones', async () => {
  // not enough data yet
  await assert.rejects(() => M.trainModel('rising'), /Faltan datos/);
  // references from athletes: 24 good repetitions
  st.addRef({ id: 'ref-a', ex: 'rising', arm: 'right', source: 'pro', label: 'Atleta A', at: '2026-10-01T10:00:00Z', reps: S.toRefReps(reps(12, { range: 28, jitter: 1, seed: 100 })) });
  st.addRef({ id: 'ref-b', ex: 'rising', arm: 'right', source: 'pro', label: 'Atleta B', at: '2026-10-02T10:00:00Z', reps: S.toRefReps(reps(12, { range: 34, dur: 2900, jitter: 1, seed: 200 })) });
  // two rated sets of the user: one good, one bad (stuttering)
  const mkSet = (id, rate, o) => ({ id, ex: 'rising', arm: 'right', kg: 10, at: '2026-10-03T10:00:00Z', dur: 20000, reps: reps(10, o), marks: [], note: '', pl: 0, rate });
  await st.addSet(mkSet('good1', 'good', { range: 30, seed: 300, jitter: 1 }));
  await st.addSet(mkSet('bad1', 'bad', { range: 30, seed: 400, shape: 'stutter' }));
  const data = M.collectData('rising');
  assert.equal(data.counts.refs, 24);
  assert.equal(data.counts.good, 10);
  assert.equal(data.counts.bad, 10);
  assert.equal(data.pos.length, 34);
  assert.equal(data.neg.length, 10);

  const progress = [];
  const model = await M.trainModel('rising', (phase, e, n) => progress.push(phase));
  assert.ok(progress.includes('ae') && progress.includes('clf'), 'autoencoder and classifier were both trained');
  assert.equal(model.nPos, 34);
  assert.equal(model.nNeg, 10);
  assert.ok(model.clf, 'bad examples were enough for the classifier');
  assert.ok(JSON.stringify(model).length < 60000, 'the stored model is small');
  assert.equal(st.state.models.rising.nPos, 34, 'saved in the app state');
  assert.ok(JSON.parse(mem.get('fulcro.models.v1')).rising, 'and persisted');

  const T = st.targetsFor('rising');
  assert.ok(T.model, 'scoring now uses the model');
  const good = S.scoreSet(reps(5, { range: 30, seed: 900, jitter: 1 }), T);
  const bad = S.scoreSet(reps(5, { range: 30, seed: 950, shape: 'stutter' }), T);
  assert.ok(good.parts.technique > bad.parts.technique + 25, `technique ${good.parts.technique} vs ${bad.parts.technique}`);
  assert.ok(good.total > bad.total + 15, `total ${good.total} vs ${bad.total}`);
  assert.equal(good.tSrc.model, 34);
  st.setUseRefs(false);
  assert.equal(st.targetsFor('rising').model, null, 'switching references off also switches the model off');
  st.setUseRefs(true);
  st.deleteTrainedModel('rising');
  assert.equal(st.targetsFor('rising').model, null);
});

test('references can be made from the user\'s own set and deleted', () => {
  const set = { id: 's9', ex: 'cup', arm: 'left', at: '2026-10-04T10:00:00Z', reps: reps(4, { range: 30 }) };
  const ref = st.refFromSet(set, 'Mi mejor serie');
  assert.equal(ref.id, 'set-s9');
  assert.equal(ref.source, 'own');
  assert.equal(ref.reps.length, 4);
  assert.equal(st.refFromSet({ ...set, reps: set.reps.slice(0, 2) }), null, 'needs 3 repetitions');
  assert.equal(st.refFromSet({ ...set, reps: set.reps.map((r) => ({ ...r, c: undefined })) }), null, 'old sets without curves cannot be used');
  st.addRef(ref);
  assert.ok(st.allRefs().some((r) => r.id === 'set-s9'));
  st.deleteRef('set-s9');
  assert.ok(!st.allRefs().some((r) => r.id === 'set-s9'));
});
