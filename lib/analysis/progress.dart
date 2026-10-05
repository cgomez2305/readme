import '../data/models.dart';

DateTime dayOf(DateTime d) => DateTime(d.year, d.month, d.day);

/// Monday 00:00 of the week containing [d].
DateTime weekStart(DateTime d) => dayOf(d).subtract(Duration(days: d.weekday - 1));

/// Distinct days with at least one recorded set in the week containing [ref].
int trainingDaysInWeek(List<SetRecord> sets, DateTime ref) {
  final start = weekStart(ref);
  final end = start.add(const Duration(days: 7));
  return sets
      .where((s) => !s.startedAt.isBefore(start) && s.startedAt.isBefore(end))
      .map((s) => dayOf(s.startedAt))
      .toSet()
      .length;
}

/// Consecutive weeks (ending this week, or last week if this one is not done yet)
/// with at least [goal] training days.
int weeklyStreak(List<SetRecord> sets, int goal, DateTime now) {
  if (goal <= 0) return 0;
  var week = weekStart(now);
  if (trainingDaysInWeek(sets, week) < goal) {
    week = week.subtract(const Duration(days: 7));
  }
  var streak = 0;
  while (trainingDaysInWeek(sets, week) >= goal) {
    streak++;
    week = week.subtract(const Duration(days: 7));
  }
  return streak;
}

class TrendPoint {
  const TrendPoint(this.date, this.value);
  final DateTime date;
  final double value;
}

/// Average range per training day for one exercise.
List<TrendPoint> rangeTrend(List<SetRecord> sets, String exerciseId, {Arm? arm}) {
  final byDay = <DateTime, List<double>>{};
  for (final s in sets) {
    if (s.exerciseId != exerciseId || s.reps.isEmpty) continue;
    if (arm != null && s.arm != arm) continue;
    byDay.putIfAbsent(dayOf(s.startedAt), () => []).add(s.avgRange);
  }
  final days = byDay.keys.toList()..sort();
  return [for (final d in days) TrendPoint(d, mean(byDay[d]!))];
}

/// Heaviest weight used per training day for one exercise.
List<TrendPoint> weightTrend(List<SetRecord> sets, String exerciseId) {
  final byDay = <DateTime, double>{};
  for (final s in sets) {
    if (s.exerciseId != exerciseId) continue;
    final d = dayOf(s.startedAt);
    if (s.weightKg > (byDay[d] ?? 0)) byDay[d] = s.weightKg;
  }
  final days = byDay.keys.toList()..sort();
  return [for (final d in days) TrendPoint(d, byDay[d]!)];
}

class ArmComparison {
  const ArmComparison({
    required this.leftRange,
    required this.rightRange,
    required this.leftTempoMs,
    required this.rightTempoMs,
    required this.leftSets,
    required this.rightSets,
  });

  final double leftRange;
  final double rightRange;
  final double leftTempoMs;
  final double rightTempoMs;
  final int leftSets;
  final int rightSets;

  bool get hasBoth => leftSets > 0 && rightSets > 0;

  /// Range difference as a percentage of the stronger side. Positive: right is larger.
  double get rangeGapPct {
    final top = leftRange > rightRange ? leftRange : rightRange;
    return top == 0 ? 0 : (rightRange - leftRange) / top * 100;
  }
}

ArmComparison compareArms(List<SetRecord> sets, String exerciseId, DateTime now, {int days = 30}) {
  final since = now.subtract(Duration(days: days));
  List<SetRecord> pick(Arm a) => sets
      .where((s) => s.exerciseId == exerciseId && s.arm == a && s.reps.isNotEmpty && s.startedAt.isAfter(since))
      .toList();
  final l = pick(Arm.left), r = pick(Arm.right);
  return ArmComparison(
    leftRange: mean(l.map((s) => s.avgRange)),
    rightRange: mean(r.map((s) => s.avgRange)),
    leftTempoMs: mean(l.map((s) => s.avgTempoMs)),
    rightTempoMs: mean(r.map((s) => s.avgTempoMs)),
    leftSets: l.length,
    rightSets: r.length,
  );
}

/// Sets with pain reported, newest first.
List<SetRecord> painEvents(List<SetRecord> sets) =>
    (sets.where((s) => s.painZone != null && s.painLevel > 0).toList()
      ..sort((a, b) => b.startedAt.compareTo(a.startedAt)));

const weekdayShort = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const weekdayName = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const monthShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

String formatDay(DateTime d) => '${d.day} ${monthShort[d.month - 1]}';
String formatTime(DateTime d) =>
    '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
