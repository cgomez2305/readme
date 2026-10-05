import 'dart:math' as math;

enum Arm {
  left('Izquierdo'),
  right('Derecho');

  const Arm(this.label);
  final String label;
}

enum PainZone {
  wrist('Muñeca'),
  elbow('Codo'),
  shoulder('Hombro'),
  tendon('Tendón / antebrazo'),
  fingers('Dedos');

  const PainZone(this.label);
  final String label;
}

/// One repetition measured on the exercise's tracked joint angle.
class RepData {
  const RepData({
    required this.startMs,
    required this.endMs,
    required this.minAngle,
    required this.maxAngle,
    this.wristAvg,
  });

  final int startMs;
  final int endMs;
  final double minAngle;
  final double maxAngle;
  final double? wristAvg;

  int get durationMs => endMs - startMs;
  double get range => maxAngle - minAngle;

  Map<String, dynamic> toJson() => {
        's': startMs,
        'e': endMs,
        'mn': minAngle,
        'mx': maxAngle,
        if (wristAvg != null) 'w': wristAvg,
      };

  factory RepData.fromJson(Map<String, dynamic> j) => RepData(
        startMs: j['s'] as int,
        endMs: j['e'] as int,
        minAngle: (j['mn'] as num).toDouble(),
        maxAngle: (j['mx'] as num).toDouble(),
        wristAvg: (j['w'] as num?)?.toDouble(),
      );
}

/// Arm landmarks of one video frame, normalised to 0..1 in upright (portrait) coordinates.
class PoseFrame {
  const PoseFrame(this.t, this.p, this.angle);

  final int t; // ms since recording started
  /// shoulder x,y · elbow x,y · wrist x,y · index finger x,y
  final List<double> p;
  final double angle;

  Map<String, dynamic> toJson() => {
        't': t,
        'p': p.map((v) => double.parse(v.toStringAsFixed(4))).toList(),
        'a': double.parse(angle.toStringAsFixed(1)),
      };

  factory PoseFrame.fromJson(Map<String, dynamic> j) => PoseFrame(
        j['t'] as int,
        (j['p'] as List).map((v) => (v as num).toDouble()).toList(),
        (j['a'] as num).toDouble(),
      );
}

/// One recorded series of one exercise.
class SetRecord {
  SetRecord({
    required this.id,
    required this.exerciseId,
    required this.arm,
    required this.weightKg,
    required this.startedAt,
    required this.durationMs,
    required this.reps,
    this.fatigueRep,
    this.marks = const [],
    this.videoPath,
    this.note = '',
    this.painZone,
    this.painLevel = 0,
  });

  final String id;
  final String exerciseId;
  final Arm arm;
  final double weightKg;
  final DateTime startedAt;
  final int durationMs;
  final List<RepData> reps;
  final int? fatigueRep; // 1-based
  List<int> marks; // ms positions in the video
  String? videoPath;
  String note;
  PainZone? painZone;
  int painLevel; // 0 none .. 3 strong

  double get avgRange =>
      reps.isEmpty ? 0 : reps.map((r) => r.range).reduce((a, b) => a + b) / reps.length;

  double get avgTempoMs =>
      reps.isEmpty ? 0 : reps.map((r) => r.durationMs).reduce((a, b) => a + b) / reps.length;

  Map<String, dynamic> toJson() => {
        'id': id,
        'ex': exerciseId,
        'arm': arm.name,
        'kg': weightKg,
        'at': startedAt.toIso8601String(),
        'dur': durationMs,
        'reps': reps.map((r) => r.toJson()).toList(),
        if (fatigueRep != null) 'fat': fatigueRep,
        'marks': marks,
        if (videoPath != null) 'video': videoPath,
        'note': note,
        if (painZone != null) 'pz': painZone!.name,
        'pl': painLevel,
      };

  factory SetRecord.fromJson(Map<String, dynamic> j) => SetRecord(
        id: j['id'] as String,
        exerciseId: j['ex'] as String,
        arm: Arm.values.byName(j['arm'] as String),
        weightKg: (j['kg'] as num).toDouble(),
        startedAt: DateTime.parse(j['at'] as String),
        durationMs: j['dur'] as int,
        reps: (j['reps'] as List).map((r) => RepData.fromJson(Map<String, dynamic>.from(r as Map))).toList(),
        fatigueRep: j['fat'] as int?,
        marks: (j['marks'] as List?)?.map((e) => e as int).toList() ?? [],
        videoPath: j['video'] as String?,
        note: (j['note'] as String?) ?? '',
        painZone: j['pz'] == null ? null : PainZone.values.byName(j['pz'] as String),
        painLevel: (j['pl'] as int?) ?? 0,
      );
}

/// Weekly plan: goal of training days, which exercise each weekday and reminder time.
class Plan {
  const Plan({
    this.weeklyGoal = 3,
    this.days = const {},
    this.reminderHour = 19,
    this.reminderMinute = 0,
    this.remindersOn = false,
  });

  final int weeklyGoal;
  final Map<int, String> days; // DateTime.weekday (1=Mon..7=Sun) -> exerciseId
  final int reminderHour;
  final int reminderMinute;
  final bool remindersOn;

  Plan copyWith({
    int? weeklyGoal,
    Map<int, String>? days,
    int? reminderHour,
    int? reminderMinute,
    bool? remindersOn,
  }) =>
      Plan(
        weeklyGoal: weeklyGoal ?? this.weeklyGoal,
        days: days ?? this.days,
        reminderHour: reminderHour ?? this.reminderHour,
        reminderMinute: reminderMinute ?? this.reminderMinute,
        remindersOn: remindersOn ?? this.remindersOn,
      );

  Map<String, dynamic> toJson() => {
        'goal': weeklyGoal,
        'days': days.map((k, v) => MapEntry('$k', v)),
        'h': reminderHour,
        'm': reminderMinute,
        'on': remindersOn,
      };

  factory Plan.fromJson(Map<String, dynamic> j) => Plan(
        weeklyGoal: (j['goal'] as int?) ?? 3,
        days: ((j['days'] as Map?) ?? {}).map((k, v) => MapEntry(int.parse(k as String), v as String)),
        reminderHour: (j['h'] as int?) ?? 19,
        reminderMinute: (j['m'] as int?) ?? 0,
        remindersOn: (j['on'] as bool?) ?? false,
      );
}

double mean(Iterable<double> xs) => xs.isEmpty ? 0 : xs.reduce((a, b) => a + b) / xs.length;

double stdDev(Iterable<double> xs) {
  if (xs.length < 2) return 0;
  final m = mean(xs);
  return math.sqrt(xs.map((x) => (x - m) * (x - m)).reduce((a, b) => a + b) / xs.length);
}
