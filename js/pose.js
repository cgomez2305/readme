// On-device arm tracking with MediaPipe Pose Landmarker (runs in the browser, nothing is uploaded).
import { jointAngle, AngleFilter } from './analysis.js';

// MediaPipe landmark indices: shoulder, elbow, wrist, index finger.
const IDX = {
  left: { s: 11, e: 13, w: 15, i: 19 },
  right: { s: 12, e: 14, w: 16, i: 20 },
};

const MODELS = { lite: 'vendor/models/pose_landmarker_lite.task', full: 'vendor/models/pose_landmarker_full.task' };
const promises = {};

/** Creates a new landmarker (GPU first, CPU as fallback). The full model is slower but more accurate. */
export async function createLandmarker(variant = 'lite') {
  const { FilesetResolver, PoseLandmarker } = await import('../vendor/vision_bundle.mjs');
  const fileset = await FilesetResolver.forVisionTasks('vendor/wasm');
  const make = (delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODELS[variant] ?? MODELS.lite, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  let lm;
  try {
    lm = await make('GPU');
    lm.delegate = 'GPU';
  } catch {
    lm = await make('CPU');
    lm.delegate = 'CPU';
  }
  return lm;
}

/** Loads the model once per variant and keeps it. Used by the live camera. */
export function loadLandmarker(onStatus = () => {}, variant = 'lite') {
  promises[variant] ??= (async () => {
    onStatus('Cargando modelo...');
    const lm = await createLandmarker(variant);
    onStatus('');
    return lm;
  })().catch((e) => {
    promises[variant] = undefined;
    throw e;
  });
  return promises[variant];
}

/**
 * Runs the arm detection over a video file on this phone, frame by frame, for the reference training.
 * Nothing is uploaded and the video is not stored. Returns, for each arm, the filtered angle series
 * [[ms, degrees]] and how much of the video the arm was seen.
 * @param {File} file
 * @param {{joint:'elbow'|'wrist', onProgress?:(p:number)=>void, shouldCancel?:()=>boolean}} o
 */
export async function analyzeVideoFile(file, { joint = 'elbow', onProgress = () => {}, shouldCancel = () => false } = {}) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  let lm = null;
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('No se pudo leer el vídeo. Prueba con un archivo MP4 o WebM.'));
    });
    const durationMs = video.duration * 1000;
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('No se pudo leer la duración del vídeo.');
    if (video.duration > 240) throw new Error('El vídeo dura más de 4 minutos. Recorta el tramo con las repeticiones.');
    const fake = globalThis.__FAKE_DETECT; // test hook: landmarks as a function of the video time
    lm = fake ? null : await createLandmarker('full');
    const state = {
      left: { filter: new AngleFilter(0.5), series: [], seen: 0, lostAt: null },
      right: { filter: new AngleFilter(0.5), series: [], seen: 0, lostAt: null },
    };
    let frames = 0, lastTs = 0;
    const step = (tMs) => {
      frames++;
      let lmks;
      if (fake) lmks = fake(tMs)?.landmarks?.[0];
      else {
        lastTs = Math.max(lastTs + 1, performance.now());
        lmks = lm.detectForVideo(video, lastTs).landmarks?.[0];
      }
      for (const arm of ['left', 'right']) {
        const st = state[arm];
        const r = readArm(lmks, arm, video.videoWidth || 1, video.videoHeight || 1, joint);
        const a = trackedAngle(r, joint);
        if (a == null) {
          if (st.lostAt == null) st.lostAt = tMs;
          if (tMs - st.lostAt > 600) st.filter.reset();
        } else {
          st.lostAt = null;
          st.seen++;
          st.series.push([Math.round(tMs), Math.round(st.filter.push(a) * 10) / 10]);
        }
      }
    };
    video.playbackRate = fake ? 4 : video.duration > 90 ? 2 : 1; // the test hook needs no model time per frame
    await video.play();
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      video.onended = finish;
      const tick = (_now, meta) => {
        if (done) return;
        if (shouldCancel()) { video.pause(); return finish(); }
        const t = (meta?.mediaTime ?? video.currentTime) * 1000;
        step(t);
        onProgress(Math.min(1, t / durationMs));
        if (video.ended) return finish();
        schedule();
      };
      const schedule = () => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(() => tick(0, null)));
      schedule();
    });
    onProgress(1);
    return {
      durationMs, frames, cancelled: shouldCancel(),
      series: { left: state.left.series, right: state.right.series },
      cov: { left: frames ? state.left.seen / frames : 0, right: frames ? state.right.seen / frames : 0 },
    };
  } finally {
    try { video.pause(); } catch { /* ignore */ }
    URL.revokeObjectURL(url);
    try { lm?.close(); } catch { /* ignore */ }
  }
}

/**
 * Reads the chosen arm from the landmarks of one frame. Angles are computed in pixel space
 * (normalised x,y have different scales). Only the points the exercise needs have to be visible:
 * the elbow angle needs shoulder, elbow and wrist; the wrist angle needs elbow, wrist and index finger,
 * so a close-up of the forearm with the shoulder out of the picture still works.
 * Returns null when those points are not confidently seen.
 */
export function readArm(landmarks, arm, width, height, joint = 'elbow', minVisibility = 0.4) {
  const ix = IDX[arm];
  const pts = [landmarks?.[ix.s], landmarks?.[ix.e], landmarks?.[ix.w], landmarks?.[ix.i]];
  const need = joint === 'wrist' ? [1, 2, 3] : [0, 1, 2];
  if (!landmarks || need.some((k) => !pts[k])) return null;
  const conf = Math.min(...need.map((k) => pts[k].visibility ?? 1));
  if (conf < minVisibility) return null;
  const px = pts.map((q) => ({ x: q.x * width, y: q.y * height }));
  const p = pts.flatMap((q) => [q.x, q.y]);
  return {
    p, // shoulder x,y · elbow x,y · wrist x,y · index x,y — normalised 0..1
    elbowAngle: joint === 'wrist' ? null : jointAngle(px[0], px[1], px[2]),
    wristAngle: jointAngle(px[1], px[2], px[3]),
    confidence: conf,
    inFrame: need.every((k) => p[k * 2] > 0.02 && p[k * 2] < 0.98 && p[k * 2 + 1] > 0.02 && p[k * 2 + 1] < 0.98),
  };
}

/** Angle tracked by an exercise: the elbow or the wrist angle of a reading. */
export const trackedAngle = (reading, joint) => (reading ? (joint === 'elbow' ? reading.elbowAngle : reading.wristAngle) : null);

/**
 * Draws the arm skeleton. p is normalised; the canvas must cover exactly the image area.
 * mirror = true flips x, for a selfie view that is shown mirrored (the angle label is never mirrored).
 */
export function drawArm(ctx, p, joint, angle, mirror = false) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (!p) return;
  const pt = (i) => [(mirror ? 1 - p[i * 2] : p[i * 2]) * w, p[i * 2 + 1] * h];
  const [s, e, wr, ix] = [pt(0), pt(1), pt(2), pt(3)];
  const grad = ctx.createLinearGradient(0, h, w, 0);
  grad.addColorStop(0, '#FF8A4C');
  grad.addColorStop(1, '#FFC27A');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(5, w * 0.018);
  ctx.beginPath();
  if (joint === 'wrist') ctx.moveTo(...e); // close-up of the forearm: the shoulder may be out of the picture
  else { ctx.moveTo(...s); ctx.lineTo(...e); }
  ctx.lineTo(...wr);
  ctx.stroke();
  ctx.lineWidth = Math.max(4, w * 0.013);
  ctx.beginPath();
  ctx.moveTo(...wr);
  ctx.lineTo(...ix);
  ctx.stroke();
  const dot = (pos, tracked) => {
    const r = Math.max(6, w * (tracked ? 0.026 : 0.018));
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], r, 0, Math.PI * 2);
    ctx.fillStyle = '#0E1118';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = tracked ? '#FF8A4C' : '#fff';
    ctx.stroke();
  };
  if (joint !== 'wrist') dot(s, false);
  dot(e, joint === 'elbow');
  dot(wr, joint === 'wrist');
  dot(ix, false);
  if (angle != null) {
    const at = joint === 'elbow' ? e : wr;
    ctx.font = `800 ${Math.max(16, w * 0.055)}px Figtree, system-ui, sans-serif`;
    ctx.fillStyle = '#3FE0C5';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.fillText(`${Math.round(angle)}°`, at[0] + 14, at[1] - 14);
    ctx.shadowBlur = 0;
  }
}
