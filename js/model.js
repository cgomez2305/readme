// Training of the technique model, on this phone. Data: repetitions of the references (athletes and the user's
// own good series) and of the user's sets rated "buena" are good examples; sets rated "mala" are bad examples.
import { state, allRefs, setTrainedModel } from './state.js';
import { exerciseById } from './exercises.js';
import { repFeatures, featScale, toRefReps } from './score.js';
import { trainAutoencoder, trainClassifier, augment, rng } from './nn.js';

export const MIN_GOOD = 12; // below this a model would only memorise a handful of repetitions
export const MIN_BAD = 8; // needed (with MIN_GOOD) to also train the good-vs-bad classifier

/** Repetitions with a curve of one set, in the reference shape. */
const setReps = (set) => toRefReps(set.reps.filter((r) => r.c));

/** The training data for one exercise, as model inputs, plus where it came from. */
export function collectData(exId) {
  const ex = exerciseById(exId), feat = featScale(ex);
  const f = (reps) => reps.map((r) => repFeatures(r, feat)).filter(Boolean);
  const refReps = allRefs().filter((r) => r.ex === exId).flatMap((r) => r.reps);
  const good = state.sets.filter((s) => s.ex === exId && s.rate === 'good').flatMap(setReps);
  const bad = state.sets.filter((s) => s.ex === exId && s.rate === 'bad').flatMap(setReps);
  const pos = f(refReps).concat(f(good)), neg = f(bad);
  return { pos, neg, counts: { refs: refReps.length, good: good.length, bad: bad.length } };
}

const thin = (xs, max, seed) => {
  if (xs.length <= max) return xs;
  const r = rng(seed);
  return [...xs].sort(() => r() - 0.5).slice(0, max);
};

/**
 * Trains and stores the model of an exercise. onProgress(phase, epoch, total, loss) reports progress.
 * Throws an Error with a user-facing message when there is not enough data.
 */
export async function trainModel(exId, onProgress = () => {}) {
  const { pos, neg } = collectData(exId);
  if (pos.length < MIN_GOOD) throw new Error(`Faltan datos: hay ${pos.length} repeticiones buenas y hacen falta al menos ${MIN_GOOD}. Sube vídeos de referencia o valora tus series como buenas.`);
  // keep training fast on a phone: at most 150 real repetitions, each with a few noisy copies
  const good = augment(thin(pos, 150, 5), 3);
  const ae = await trainAutoencoder(good, { epochs: 100, seed: 2, onEpoch: (e, n, l) => onProgress('ae', e, n, l) });
  let clf = null;
  if (neg.length >= MIN_BAD) {
    clf = await trainClassifier(thin(pos, 150, 6), augment(thin(neg, 150, 7), 2), { epochs: 120, seed: 3, onEpoch: (e, n, l) => onProgress('clf', e, n, l) });
  }
  const down = (xs) => xs.filter((_, i) => i % 5 === 0).map((v) => Math.round(v * 1e5) / 1e5);
  const model = {
    ex: exId, at: new Date().toISOString(), nPos: pos.length, nNeg: neg.length,
    ae: { net: ae.model.toJSON(), stats: { ...ae.stats, curve: down(ae.stats.curve), valCurve: down(ae.stats.valCurve) } },
    clf: clf ? { net: clf.model.toJSON(), stats: { ...clf.stats, curve: down(clf.stats.curve) } } : null,
  };
  setTrainedModel(model);
  return model;
}
