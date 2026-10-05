// Tiny neural networks that train in the browser, with no dependencies. Used for the technique model:
//  - an autoencoder learns what a good repetition looks like (from references and sets rated "good"); a
//    repetition it reconstructs badly is unusual, so it scores low;
//  - an optional classifier learns good vs bad when the user has rated sets as "mala".
// The networks are small (about a thousand weights), so training takes a second or two on a phone.

/** Small deterministic random generator so training can be repeated and tested. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** Fully connected network: tanh hidden layers and a sigmoid output (values between 0 and 1). */
export class MLP {
  constructor(sizes, seed = 1) {
    this.sizes = sizes;
    const r = rng(seed);
    this.W = []; this.b = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const fanIn = sizes[l], limit = Math.sqrt(6 / (sizes[l] + sizes[l + 1]));
      this.W.push(Array.from({ length: sizes[l + 1] }, () => Array.from({ length: fanIn }, () => (r() * 2 - 1) * limit)));
      this.b.push(new Array(sizes[l + 1]).fill(0));
    }
  }

  /** Activations of every layer for input x (index 0 is x itself). */
  forward(x) {
    const acts = [x];
    for (let l = 0; l < this.W.length; l++) {
      const prev = acts[l], last = l === this.W.length - 1;
      acts.push(this.W[l].map((row, j) => {
        let z = this.b[l][j];
        for (let i = 0; i < row.length; i++) z += row[i] * prev[i];
        return last ? sigmoid(z) : Math.tanh(z);
      }));
    }
    return acts;
  }
  predict(x) { return this.forward(x).at(-1); }

  /**
   * One Adam step on a batch. loss: 'mse' (target is a vector) or 'bce' (target is a single 0/1 value).
   * Returns the mean loss of the batch.
   */
  step(batch, targets, loss, opt) {
    const gW = this.W.map((m) => m.map((row) => new Array(row.length).fill(0)));
    const gb = this.b.map((v) => new Array(v.length).fill(0));
    let total = 0;
    for (let n = 0; n < batch.length; n++) {
      const acts = this.forward(batch[n]);
      const out = acts.at(-1), t = targets[n];
      let delta;
      if (loss === 'bce') {
        const y = Array.isArray(t) ? t[0] : t;
        total += -(y * Math.log(out[0] + 1e-9) + (1 - y) * Math.log(1 - out[0] + 1e-9));
        delta = [out[0] - y]; // sigmoid + cross entropy
      } else {
        delta = out.map((o, k) => {
          const e = o - t[k];
          total += (e * e) / out.length;
          return ((2 * e) / out.length) * o * (1 - o);
        });
      }
      for (let l = this.W.length - 1; l >= 0; l--) {
        const prev = acts[l];
        for (let j = 0; j < delta.length; j++) {
          gb[l][j] += delta[j];
          for (let i = 0; i < prev.length; i++) gW[l][j][i] += delta[j] * prev[i];
        }
        if (l > 0) {
          const next = new Array(prev.length).fill(0);
          for (let i = 0; i < prev.length; i++) {
            let s = 0;
            for (let j = 0; j < delta.length; j++) s += this.W[l][j][i] * delta[j];
            next[i] = s * (1 - prev[i] * prev[i]); // tanh derivative
          }
          delta = next;
        }
      }
    }
    opt.t++;
    const { lr, b1 = 0.9, b2 = 0.999, eps = 1e-8 } = opt;
    const c1 = 1 - b1 ** opt.t, c2 = 1 - b2 ** opt.t;
    const upd = (p, g, m, v, i) => {
      const gi = g[i] / batch.length;
      m[i] = b1 * m[i] + (1 - b1) * gi;
      v[i] = b2 * v[i] + (1 - b2) * gi * gi;
      p[i] -= (lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + eps);
    };
    for (let l = 0; l < this.W.length; l++) {
      for (let j = 0; j < this.W[l].length; j++) {
        for (let i = 0; i < this.W[l][j].length; i++) upd(this.W[l][j], gW[l][j], opt.mW[l][j], opt.vW[l][j], i);
        upd(this.b[l], gb[l], opt.mb[l], opt.vb[l], j);
      }
    }
    return total / batch.length;
  }

  newOptimizer(lr) {
    const zeros = (m) => m.map((row) => new Array(row.length).fill(0));
    return { t: 0, lr, mW: this.W.map(zeros), vW: this.W.map(zeros), mb: zeros(this.b), vb: zeros(this.b) };
  }

  toJSON() {
    const r = (x) => Math.round(x * 1e4) / 1e4;
    return { sizes: this.sizes, W: this.W.map((m) => m.map((row) => row.map(r))), b: this.b.map((v) => v.map(r)) };
  }
  static fromJSON(j) {
    const m = new MLP(j.sizes, 1);
    m.W = j.W; m.b = j.b;
    return m;
  }
}

function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quantile = (xs, p) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
};

/** Pause so the page can repaint during long training. */
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Trains an autoencoder on "good" samples (arrays of numbers in 0..1).
 * Holds out 20% for validation. Returns { model, stats } where stats has the training curves and the
 * distribution of reconstruction errors that is used to turn an error into a 0-100 score.
 */
export async function trainAutoencoder(samples, { epochs = 150, lr = 0.01, hidden = [12, 4, 12], seed = 1, onEpoch } = {}) {
  const r = rng(seed);
  const data = shuffle([...samples], r);
  const nVal = data.length >= 10 ? Math.max(2, Math.round(data.length * 0.2)) : 0;
  const val = data.slice(0, nVal), train = data.slice(nVal);
  const d = samples[0].length;
  const net = new MLP([d, ...hidden, d], seed);
  const opt = net.newOptimizer(lr);
  const curve = [], valCurve = [];
  const batchSize = Math.min(16, train.length);
  for (let e = 0; e < epochs; e++) {
    shuffle(train, r);
    let loss = 0, nb = 0;
    for (let i = 0; i < train.length; i += batchSize) {
      const batch = train.slice(i, i + batchSize);
      loss += net.step(batch, batch, 'mse', opt);
      nb++;
    }
    curve.push(loss / nb);
    if (val.length) valCurve.push(mean(val.map((x) => reconError(net, x))));
    if (onEpoch && (e % 5 === 0 || e === epochs - 1)) { onEpoch(e + 1, epochs, curve.at(-1)); await tick(); }
  }
  // Errors on the data the net has seen and on the held-out data: the held-out ones are the honest ones.
  const errs = train.map((x) => reconError(net, x));
  const valErrs = val.map((x) => reconError(net, x));
  const ref = valErrs.length >= 3 ? valErrs.concat(errs) : errs;
  return {
    model: net,
    stats: {
      trainLoss: curve.at(-1), valLoss: valCurve.length ? valCurve.at(-1) : null, curve, valCurve,
      p50: quantile(ref, 0.5), p95: quantile(ref, 0.95), n: samples.length, nVal: val.length,
    },
  };
}

export function reconError(net, x) {
  const out = net.predict(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (out[i] - x[i]) ** 2;
  return s / x.length;
}

/** 0-100: 100 for errors typical of the good data, falling to 0 at three times the 95th percentile. */
export function aeScore(net, stats, x) {
  const e = reconError(net, x);
  const lo = stats.p50, hi = Math.max(stats.p95 * 3, lo + 1e-6);
  if (e <= lo) return 100;
  return Math.max(0, 100 * (1 - (e - lo) / (hi - lo)));
}

/** Trains a good-vs-bad classifier. Returns { model, stats } (stats.valAcc is on held-out samples). */
export async function trainClassifier(pos, neg, { epochs = 200, lr = 0.02, hidden = [8], seed = 1, onEpoch } = {}) {
  const r = rng(seed);
  const all = shuffle([...pos.map((x) => [x, 1]), ...neg.map((x) => [x, 0])], r);
  const nVal = all.length >= 20 ? Math.round(all.length * 0.2) : 0;
  const val = all.slice(0, nVal), train = all.slice(nVal);
  const net = new MLP([all[0][0].length, ...hidden, 1], seed);
  const opt = net.newOptimizer(lr);
  const batchSize = Math.min(16, train.length);
  const acc = (set) => (set.length ? set.filter(([x, y]) => (net.predict(x)[0] >= 0.5) === (y === 1)).length / set.length : null);
  const curve = [];
  for (let e = 0; e < epochs; e++) {
    shuffle(train, r);
    let loss = 0, nb = 0;
    for (let i = 0; i < train.length; i += batchSize) {
      const b = train.slice(i, i + batchSize);
      loss += net.step(b.map((p) => p[0]), b.map((p) => p[1]), 'bce', opt);
      nb++;
    }
    curve.push(loss / nb);
    if (onEpoch && (e % 5 === 0 || e === epochs - 1)) { onEpoch(e + 1, epochs, curve.at(-1)); await tick(); }
  }
  return { model: net, stats: { trainAcc: acc(train), valAcc: acc(val), curve, n: all.length, nPos: pos.length, nNeg: neg.length } };
}

/** Variants of a sample for training with little data: small noise on every value, kept inside 0..1. */
export function augment(samples, copies = 8, { sigma = 0.02, seed = 7 } = {}) {
  const r = rng(seed);
  const out = [];
  for (const s of samples) {
    out.push(s);
    for (let k = 0; k < copies; k++) out.push(s.map((v) => Math.min(1, Math.max(0, v + gauss(r) * sigma))));
  }
  return out;
}
