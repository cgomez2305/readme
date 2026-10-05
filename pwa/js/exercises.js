// Exercise templates. Thresholds are starting values to tune after the first sets.
// joint: which angle is tracked ('elbow' = shoulder-elbow-wrist, 'wrist' = elbow-wrist-index).
// A rep starts when the angle drops below openAbove and counts once it goes below closedBelow and returns.
export const exercises = [
  {
    id: 'press', name: 'Press lateral', focus: 'Hombro, pecho y codo', joint: 'elbow',
    openAbove: 125, closedBelow: 80, minRange: 50, tempoMinMs: 1800, tempoMaxMs: 4000, defaultSets: 4,
    cues: ['Codo apoyado en el pad', 'Hombro bajo, sin encogerlo', 'Sube y baja sin rebote'],
    camera: 'De lado, a la altura de la mesa, con el brazo completo a la vista.', precision: 'Alta',
  },
  {
    id: 'pronation', name: 'Pronación', focus: 'Antebrazo y dedos', joint: 'wrist',
    openAbove: 165, closedBelow: 140, minRange: 25, tempoMinMs: 1500, tempoMaxMs: 3500, defaultSets: 4,
    cues: ['Codo fijo', 'Rota desde el antebrazo, no desde el hombro', 'Controla la bajada'],
    camera: 'De frente a la mano, con el antebrazo y la muñeca visibles.',
    precision: 'Baja: la rotación se ve en 2D solo de forma indirecta',
  },
  {
    id: 'supination', name: 'Supinación', focus: 'Antebrazo y bíceps', joint: 'wrist',
    openAbove: 165, closedBelow: 140, minRange: 25, tempoMinMs: 1500, tempoMaxMs: 3500, defaultSets: 4,
    cues: ['Codo fijo', 'Gira hacia fuera sin abrir el codo', 'No muevas el hombro'],
    camera: 'De frente a la mano, con el antebrazo y la muñeca visibles.',
    precision: 'Baja: la rotación se ve en 2D solo de forma indirecta',
  },
  {
    id: 'cup', name: 'Cup (flexión de muñeca)', focus: 'Muñeca y dedos', joint: 'wrist',
    openAbove: 165, closedBelow: 130, minRange: 35, tempoMinMs: 1500, tempoMaxMs: 3500, defaultSets: 4,
    cues: ['Antebrazo apoyado', 'Cierra la muñeca hacia ti', 'Sin ayudarte con el codo'],
    camera: 'De lado, con la muñeca y la mano en perfil.', precision: 'Media',
  },
  {
    id: 'rising', name: 'Rising', focus: 'Muñeca (desviación radial) y pulgar', joint: 'wrist',
    openAbove: 170, closedBelow: 150, minRange: 20, tempoMinMs: 1500, tempoMaxMs: 3500, defaultSets: 4,
    cues: ['Antebrazo apoyado', 'Sube la mano hacia el pulgar', 'Baja controlado'],
    camera: 'Desde arriba o de frente a la mano, con la muñeca visible.', precision: 'Media',
  },
  {
    id: 'back_pressure', name: 'Back pressure', focus: 'Codo, hombro y espalda', joint: 'elbow',
    openAbove: 140, closedBelow: 95, minRange: 35, tempoMinMs: 2000, tempoMaxMs: 4500, defaultSets: 4,
    cues: ['Codo pegado al cuerpo', 'Tira con la espalda', 'No abras el codo al final'],
    camera: 'De lado, a la altura de la mesa, con el brazo completo a la vista.', precision: 'Alta',
  },
];

export const exerciseById = (id) => exercises.find((e) => e.id === id) ?? exercises[0];
export const jointLabel = (ex) => (ex.joint === 'elbow' ? 'Codo' : 'Muñeca');

export const painZones = [
  ['wrist', 'Muñeca'], ['elbow', 'Codo'], ['shoulder', 'Hombro'], ['tendon', 'Tendón / antebrazo'], ['fingers', 'Dedos'],
];
export const painZoneLabel = (id) => painZones.find((z) => z[0] === id)?.[1] ?? '';
export const armLabel = (a) => (a === 'left' ? 'Izquierdo' : 'Derecho');
