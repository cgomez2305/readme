import test from 'node:test';
import assert from 'node:assert/strict';
import { MLP, rng, trainAutoencoder, trainClassifier, aeScore, reconError, augment } from '../js/nn.js';

// "Good repetitions": a smooth down-and-up curve, normalised 0..1, with small natural variation.
const goodCurve = (r, jitter = 0.02) => Array.from({ length: 24 }, (_, i) => {
  const t = i / 23;
  return Math.min(1, Math.max(0, 0.5 + 0.5 * Math.cos(2 * Math.PI * t) + (r() - 0.5) * 2 * jitter));
});
// "Bad repetitions": a half-range stutter that never returns up smoothly.
const badCurve = (r) => Array.from({ length: 24 }, (_, i) => {
  const t = i / 23;
  return Math.min(1, Math.max(0, 0.5 + 0.25 * Math.sin(6 * Math.PI * t) + (r() - 0.5) * 0.2));
});

test('rng is deterministic', () => {
  const a = rng(5), b = rng(5);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('backprop gradient matches a numeric gradient', () => {
  const net = new MLP([3, 4, 2], 3);
  const x = [0.2, 0.7, 0.4], t = [0.9, 0.1];
  const loss = () => { const o = net.predict(x); return o.reduce((s, v, k) => s + (v - t[k]) ** 2, 0) / o.length; };
  const w = net.W[0][1][2];
  const eps = 1e-5;
  net.W[0][1][2] = w + eps; const up = loss();
  net.W[0][1][2] = w - eps; const down = loss();
  net.W[0][1][2] = w;
  const numeric = (up - down) / (2 * eps);
  // one tiny step with lr ~ 0 recovers the analytic gradient through the Adam first moment
  const opt = net.newOptimizer(1e-12);
  net.step([x], [t], 'mse', opt);
  const analytic = opt.mW[0][1][2] / 0.1; // m = (1 - b1) * g
  assert.ok(Math.abs(numeric - analytic) < 1e-4 * Math.max(1, Math.abs(numeric)) + 1e-6, `${numeric} vs ${analytic}`);
});

test('the autoencoder learns good repetitions and scores strange ones low', async () => {
  const r = rng(11);
  const good = Array.from({ length: 40 }, () => goodCurve(r));
  const { model, stats } = await trainAutoencoder(augment(good, 4), { epochs: 120, seed: 2 });
  assert.ok(stats.valLoss < stats.curve[0], 'validation loss improved over the first epoch');
  assert.ok(stats.trainLoss < 0.01);
  const fresh = Array.from({ length: 20 }, () => aeScore(model, stats, goodCurve(r)));
  const bad = Array.from({ length: 20 }, () => aeScore(model, stats, badCurve(r)));
  const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(m(fresh) > 70, `good reps score ${m(fresh)}`);
  assert.ok(m(bad) < 40, `bad reps score ${m(bad)}`);
  assert.ok(m(fresh) - m(bad) > 40);
});

test('the classifier separates good from bad and survives JSON', async () => {
  const r = rng(21);
  const pos = Array.from({ length: 40 }, () => goodCurve(r, 0.04));
  const neg = Array.from({ length: 40 }, () => badCurve(r));
  const { model, stats } = await trainClassifier(pos, neg, { epochs: 120, seed: 3 });
  assert.ok(stats.valAcc >= 0.9, `validation accuracy ${stats.valAcc}`);
  const copy = MLP.fromJSON(JSON.parse(JSON.stringify(model.toJSON())));
  const x = goodCurve(r);
  assert.ok(Math.abs(copy.predict(x)[0] - model.predict(x)[0]) < 1e-3);
  assert.ok(copy.predict(goodCurve(r))[0] > 0.7 && copy.predict(badCurve(r))[0] < 0.3);
});

test('training is repeatable and the saved model is small', async () => {
  const r = rng(31);
  const good = Array.from({ length: 15 }, () => goodCurve(r));
  const a = await trainAutoencoder(good, { epochs: 20, seed: 4 });
  const b = await trainAutoencoder(good, { epochs: 20, seed: 4 });
  assert.equal(JSON.stringify(a.model.toJSON()), JSON.stringify(b.model.toJSON()));
  assert.ok(JSON.stringify(a.model.toJSON()).length < 20000, 'the model fits in a few KB');
  assert.ok(reconError(a.model, good[0]) >= 0);
});

test('augment keeps values in range and multiplies the data', () => {
  const out = augment([[0, 0.5, 1]], 5);
  assert.equal(out.length, 6);
  assert.ok(out.flat().every((v) => v >= 0 && v <= 1));
});
