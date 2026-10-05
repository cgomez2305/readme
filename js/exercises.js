// Exercise templates. Thresholds are starting values to tune after the first sets.
//
// mode 'reps': a joint angle is tracked and repetitions are counted.
//   joint 'elbow' = shoulder-elbow-wrist, 'wrist' = elbow-wrist-index.
//   A rep is one full cycle (top -> bottom -> top). Each leg has to move at least repDelta(ex) degrees (30% of the target), so it works
//   whatever absolute angles the camera sees (a relaxed wrist is rarely 180 degrees).
// mode 'hold': isometric work. The app records time under tension and how steady the wrist stays.
//
// perWeek / intensity are basic guidelines from a coach, not medical advice:
//   - frequency: how many days per week the exercise can be trained at most (min = lower end of the advice)
//   - intensity: % of the 1RM to work with. Never train to failure (that is how tendinitis starts).
export const exercises = [
  {
    id: 'rising', name: 'Rising', focus: 'Muñeca (desviación radial) y pulgar', joint: 'wrist', mode: 'reps',
    minRange: 15, tempoMinMs: 1500, tempoMaxMs: 3500, defaultSets: 4,
    cues: ['Antebrazo apoyado', 'Sube la mano hacia el pulgar', 'Baja controlado'],
    camera: 'Con la mano de cara a la cámara y la muñeca visible.', precision: 'Media',
    perWeek: { max: 2 }, intensity: { min: 60, max: 60 },
  },
  {
    id: 'pronation', name: 'Pronación', focus: 'Antebrazo y dedos', joint: 'wrist', mode: 'reps',
    minRange: 18, tempoMinMs: 1500, tempoMaxMs: 3500, defaultSets: 4,
    cues: ['Codo fijo', 'Rota desde el antebrazo, no desde el hombro', 'Controla la bajada'],
    camera: 'De frente a la mano, con el antebrazo y la muñeca visibles.',
    precision: 'Baja: la rotación se ve en 2D solo de forma indirecta',
    perWeek: { max: 2 }, intensity: { min: 60, max: 60 },
  },
  {
    id: 'supination', name: 'Supinación', focus: 'Antebrazo y bíceps', joint: 'wrist', mode: 'reps',
    minRange: 18, tempoMinMs: 1500, tempoMaxMs: 3500, defaultSets: 4,
    cues: ['Codo fijo', 'Gira hacia fuera sin abrir el codo', 'No muevas el hombro'],
    camera: 'De frente a la mano, con el antebrazo y la muñeca visibles.',
    precision: 'Baja: la rotación se ve en 2D solo de forma indirecta',
    perWeek: { max: 2 }, intensity: { min: 60, max: 60 },
  },
  {
    id: 'cup', name: 'Cupping', focus: 'Muñeca y dedos', joint: 'wrist', mode: 'reps',
    minRange: 25, tempoMinMs: 1500, tempoMaxMs: 3500, defaultSets: 4,
    cues: ['Antebrazo apoyado', 'Cierra la muñeca hacia ti', 'Sin ayudarte con el codo'],
    camera: 'De lado, con la muñeca y la mano en perfil.', precision: 'Media',
    perWeek: { min: 3, max: 4, note: 'según la intensidad' }, intensity: { min: 60, max: 60 },
  },
  {
    id: 'wrist_adduction', name: 'Aducción de muñeca', focus: 'Muñeca (hacia el meñique)', joint: 'wrist', mode: 'reps',
    minRange: 15, tempoMinMs: 1500, tempoMaxMs: 3500, defaultSets: 4,
    cues: ['Antebrazo apoyado y plano', 'Lleva la mano hacia el meñique', 'Baja controlado'],
    camera: 'Con la mano de cara a la cámara y la muñeca visible.', precision: 'Media',
    perWeek: { max: 2 }, intensity: { min: 60, max: 60 },
  },
  {
    id: 'finger_hold', name: 'Retención de dedos', focus: 'Dedos y agarre', joint: 'wrist', mode: 'hold',
    minRange: 0, tempoMinMs: 0, tempoMaxMs: 0, defaultSets: 4,
    cues: ['Muñeca neutra', 'Aguanta sin que se abran los dedos', 'Para antes de perder la forma'],
    camera: 'De lado o de frente, con la mano y la muñeca visibles.',
    precision: 'Solo mide el tiempo bajo tensión y lo firme que queda la muñeca',
    perWeek: { min: 2, max: 3 }, intensity: { min: 60, max: 60 },
  },
  {
    id: 'thumb', name: 'Pulgar', focus: 'Pulgar y agarre', joint: 'wrist', mode: 'hold',
    minRange: 0, tempoMinMs: 0, tempoMaxMs: 0, defaultSets: 3,
    cues: ['Muñeca neutra', 'Carga suave', 'Controla el movimiento'],
    camera: 'De frente, con la mano y la muñeca visibles.',
    precision: 'Solo mide el tiempo bajo tensión y lo firme que queda la muñeca',
    perWeek: { max: 7, note: 'se puede todos los días' }, intensity: { min: 60, max: 60 },
  },
  {
    id: 'side_pressure', name: 'Side pressure', focus: 'Hombro, pecho y codo', joint: 'elbow', mode: 'reps',
    minRange: 35, tempoMinMs: 1800, tempoMaxMs: 4000, defaultSets: 4,
    cues: ['Codo apoyado en el pad', 'Hombro bajo, sin encogerlo', 'Sube y baja sin rebote'],
    camera: 'Con el brazo completo a la vista, de lado o de frente.', precision: 'Media',
    perWeek: { max: 2, maxSparring: 1 }, intensity: { min: 30, max: 40 },
  },
  {
    id: 'block', name: 'Bloque / Up pressure', focus: 'Codo, hombro y espalda', joint: 'elbow', mode: 'reps',
    minRange: 25, tempoMinMs: 2000, tempoMaxMs: 4500, defaultSets: 4,
    cues: ['Codo pegado al cuerpo', 'Tira con la espalda', 'No abras el codo al final'],
    camera: 'Con el brazo completo a la vista, de lado o de frente.', precision: 'Media',
    perWeek: { max: 2 }, intensity: { min: 60, max: 60 },
  },
];

/** Ids used by earlier versions of the app. */
export const legacyIds = { press: 'side_pressure', back_pressure: 'block' };

export const exerciseById = (id) => exercises.find((e) => e.id === (legacyIds[id] ?? id)) ?? exercises[0];
export const jointLabel = (ex) => (ex.joint === 'elbow' ? 'Codo' : 'Muñeca');
export const isHold = (ex) => ex.mode === 'hold';

/** How sensitive repetition counting is. High counts smaller movements (use it if reps are missed). */
export const SENSITIVITY = { low: 1.4, mid: 1, high: 0.7 };
export const sensitivityLabel = { low: 'Baja', mid: 'Media', high: 'Alta' };

/**
 * Minimum swing in degrees for each leg of a repetition: 30% of the default target range, at least 6 degrees,
 * scaled by the sensitivity. The scoring targets are separate and come from references (see score.js).
 */
export const repDelta = (ex, sens = 'mid') => Math.max(6, Math.round(ex.minRange * 0.3 * (SENSITIVITY[sens] ?? 1)));

export const painZones = [
  ['wrist', 'Muñeca'], ['elbow', 'Codo'], ['shoulder', 'Hombro'], ['tendon', 'Tendón / antebrazo'], ['fingers', 'Dedos'],
];
export const painZoneLabel = (id) => painZones.find((z) => z[0] === id)?.[1] ?? '';
export const armLabel = (a) => (a === 'left' ? 'Izquierdo' : 'Derecho');

// ---- frequency and intensity guidelines ------------------------------------------------------
/** Maximum training days per week. Side pressure drops to 1 on weeks with sparring. */
export const freqMax = (ex, sparring = false) => (sparring && ex.perWeek.maxSparring) || ex.perWeek.max;

export function freqText(ex, sparring = false) {
  const { min, max, maxSparring, note } = ex.perWeek;
  if (max >= 7) return 'Se puede entrenar todos los días';
  if (maxSparring) return `Máx. ${maxSparring} vez por semana si hay sparring, ${max} si no`;
  const n = (v) => `${v} ${v === 1 ? 'vez' : 'veces'}`;
  const base = min ? `${min} a ${max} veces por semana` : `Máx. ${n(freqMax(ex, sparring))} por semana`;
  return note ? `${base} (${note})` : base;
}

export const intensityText = (ex) =>
  ex.intensity.min === ex.intensity.max ? `${ex.intensity.max}% del 1RM` : `${ex.intensity.min}-${ex.intensity.max}% del 1RM`;

/** Recommended working weight in kg for a given 1RM, as a {low, high} range, or null without a 1RM. */
export function recommendedKg(ex, oneRm) {
  if (!(oneRm > 0)) return null;
  return { low: (oneRm * ex.intensity.min) / 100, high: (oneRm * ex.intensity.max) / 100 };
}

/**
 * Compares the weight used with the guideline. 'high' when over the top of the range by more than 10%,
 * 'max' when at or above 90% of the 1RM (never go to the maximum), 'ok' otherwise, null without a 1RM.
 */
export function intensityStatus(ex, kg, oneRm) {
  const rec = recommendedKg(ex, oneRm);
  if (!rec || !(kg > 0)) return null;
  if (kg >= oneRm * 0.9) return 'max';
  if (kg > rec.high * 1.1) return 'high';
  return 'ok';
}
