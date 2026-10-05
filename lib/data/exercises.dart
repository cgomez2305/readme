
enum Joint { elbow, wrist }

/// Exercise template. Thresholds are starting values to tune after the first sets.
class Exercise {
  const Exercise({
    required this.id,
    required this.name,
    required this.focus,
    required this.joint,
    required this.openAbove,
    required this.closedBelow,
    required this.minRange,
    required this.tempoMinMs,
    required this.tempoMaxMs,
    required this.defaultSets,
    required this.cues,
    required this.camera,
    this.precision = 'Media',
  });

  final String id;
  final String name;
  final String focus;
  final Joint joint;
  final double openAbove; // a rep starts when the angle drops below this
  final double closedBelow; // and counts once it goes below this and returns
  final double minRange; // target range of motion in degrees
  final int tempoMinMs;
  final int tempoMaxMs;
  final int defaultSets;
  final List<String> cues;
  final String camera; // where to place the phone
  final String precision; // how well a 2D camera can measure it

  String get jointLabel => joint == Joint.elbow ? 'Codo' : 'Muñeca';
}

const exercises = <Exercise>[
  Exercise(
    id: 'press',
    name: 'Press lateral',
    focus: 'Hombro, pecho y codo',
    joint: Joint.elbow,
    openAbove: 125,
    closedBelow: 80,
    minRange: 50,
    tempoMinMs: 1800,
    tempoMaxMs: 4000,
    defaultSets: 4,
    cues: ['Codo apoyado en el pad', 'Hombro bajo, sin encogerlo', 'Sube y baja sin rebote'],
    camera: 'De lado, a la altura de la mesa, con el brazo completo a la vista.',
    precision: 'Alta',
  ),
  Exercise(
    id: 'pronation',
    name: 'Pronación',
    focus: 'Antebrazo y dedos',
    joint: Joint.wrist,
    openAbove: 165,
    closedBelow: 140,
    minRange: 25,
    tempoMinMs: 1500,
    tempoMaxMs: 3500,
    defaultSets: 4,
    cues: ['Codo fijo', 'Rota desde el antebrazo, no desde el hombro', 'Controla la bajada'],
    camera: 'De frente a la mano, con el antebrazo y la muñeca visibles.',
    precision: 'Baja: la rotación se ve en 2D solo de forma indirecta',
  ),
  Exercise(
    id: 'supination',
    name: 'Supinación',
    focus: 'Antebrazo y bíceps',
    joint: Joint.wrist,
    openAbove: 165,
    closedBelow: 140,
    minRange: 25,
    tempoMinMs: 1500,
    tempoMaxMs: 3500,
    defaultSets: 4,
    cues: ['Codo fijo', 'Gira hacia fuera sin abrir el codo', 'No muevas el hombro'],
    camera: 'De frente a la mano, con el antebrazo y la muñeca visibles.',
    precision: 'Baja: la rotación se ve en 2D solo de forma indirecta',
  ),
  Exercise(
    id: 'cup',
    name: 'Cup (flexión de muñeca)',
    focus: 'Muñeca y dedos',
    joint: Joint.wrist,
    openAbove: 165,
    closedBelow: 130,
    minRange: 35,
    tempoMinMs: 1500,
    tempoMaxMs: 3500,
    defaultSets: 4,
    cues: ['Antebrazo apoyado', 'Cierra la muñeca hacia ti', 'Sin ayudarte con el codo'],
    camera: 'De lado, con la muñeca y la mano en perfil.',
    precision: 'Media',
  ),
  Exercise(
    id: 'rising',
    name: 'Rising',
    focus: 'Muñeca (desviación radial) y pulgar',
    joint: Joint.wrist,
    openAbove: 170,
    closedBelow: 150,
    minRange: 20,
    tempoMinMs: 1500,
    tempoMaxMs: 3500,
    defaultSets: 4,
    cues: ['Antebrazo apoyado', 'Sube la mano hacia el pulgar', 'Baja controlado'],
    camera: 'Desde arriba o de frente a la mano, con la muñeca visible.',
    precision: 'Media',
  ),
  Exercise(
    id: 'back_pressure',
    name: 'Back pressure',
    focus: 'Codo, hombro y espalda',
    joint: Joint.elbow,
    openAbove: 140,
    closedBelow: 95,
    minRange: 35,
    tempoMinMs: 2000,
    tempoMaxMs: 4500,
    defaultSets: 4,
    cues: ['Codo pegado al cuerpo', 'Tira con la espalda', 'No abras el codo al final'],
    camera: 'De lado, a la altura de la mesa, con el brazo completo a la vista.',
    precision: 'Alta',
  ),
];

Exercise exerciseById(String id) => exercises.firstWhere((e) => e.id == id, orElse: () => exercises.first);
