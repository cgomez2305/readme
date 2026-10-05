// On-device arm tracking with MediaPipe Pose Landmarker (runs in the browser, nothing is uploaded).
import { jointAngle } from './analysis.js';

// MediaPipe landmark indices: shoulder, elbow, wrist, index finger.
const IDX = {
  left: { s: 11, e: 13, w: 15, i: 19 },
  right: { s: 12, e: 14, w: 16, i: 20 },
};

let landmarkerPromise;

/** Loads the model once. Tries the GPU first and falls back to the CPU. */
export function loadLandmarker(onStatus = () => {}) {
  landmarkerPromise ??= (async () => {
    onStatus('Cargando modelo...');
    const { FilesetResolver, PoseLandmarker } = await import('../vendor/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks('vendor/wasm');
    const make = (delegate) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: 'vendor/models/pose_landmarker_lite.task', delegate },
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
    onStatus('');
    return lm;
  })().catch((e) => {
    landmarkerPromise = undefined;
    throw e;
  });
  return landmarkerPromise;
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
