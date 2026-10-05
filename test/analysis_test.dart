import 'package:flutter_test/flutter_test.dart';
import 'package:fulcro/analysis/angle.dart';
import 'package:fulcro/analysis/progress.dart';
import 'package:fulcro/analysis/set_summary.dart';
import 'package:fulcro/data/exercises.dart';
import 'package:fulcro/data/models.dart';

RepData rep(int start, int dur, double mn, double mx) =>
    RepData(startMs: start, endMs: start + dur, minAngle: mn, maxAngle: mx);

SetRecord set(DateTime at, {Arm arm = Arm.right, String ex = 'press', double kg = 20, double range = 50}) =>
    SetRecord(
      id: at.toIso8601String() + arm.name,
      exerciseId: ex,
      arm: arm,
      weightKg: kg,
      startedAt: at,
      durationMs: 10000,
      reps: [rep(0, 2000, 80, 80 + range)],
    );

void main() {
  group('jointAngle', () {
    test('right angle is 90', () {
      expect(jointAngle((x: 0, y: 1), (x: 0, y: 0), (x: 1, y: 0)), closeTo(90, 1e-9));
    });
    test('straight is 180', () {
      expect(jointAngle((x: -1, y: 0), (x: 0, y: 0), (x: 1, y: 0)), closeTo(180, 1e-9));
    });
    test('degenerate gives 0', () {
      expect(jointAngle((x: 0, y: 0), (x: 0, y: 0), (x: 1, y: 0)), 0);
    });
  });

  group('RepTracker', () {
    RepTracker t() => RepTracker(openAbove: 120, closedBelow: 70);

    test('counts full cycles with timing and range', () {
      final tr = t();
      // open 150 -> down to 60 -> up to 150, twice
      final samples = [
        (0, 150.0), (200, 110.0), (400, 60.0), (600, 100.0), (800, 130.0),
        (1000, 150.0), (1200, 100.0), (1400, 55.0), (1600, 125.0),
      ];
      for (final s in samples) {
        tr.add(s.$1, s.$2);
      }
      expect(tr.reps.length, 2);
      expect(tr.reps.first.startMs, 200);
      expect(tr.reps.first.endMs, 800);
      expect(tr.reps.first.minAngle, 60);
      expect(tr.reps.first.maxAngle, 150); // includes the open peak before the drop
      expect(tr.reps.last.minAngle, 55);
    });

    test('partial moves that never close are not reps', () {
      final tr = t();
      for (final s in [(0, 150.0), (200, 100.0), (400, 90.0), (600, 140.0)]) {
        tr.add(s.$1, s.$2);
      }
      expect(tr.reps, isEmpty);
    });

    test('averages wrist angle inside the rep', () {
      final tr = t();
      tr.add(0, 150);
      tr.add(100, 100, wrist: 160);
      tr.add(200, 60, wrist: 170);
      tr.add(300, 130, wrist: 180);
      expect(tr.reps.single.wristAvg, closeTo(170, 1e-9));
    });
  });

  group('fatigue and summary', () {
    test('no fatigue with steady reps', () {
      final reps = [for (var i = 0; i < 8; i++) rep(i * 2500, 2500, 70, 130)];
      expect(detectFatigue(reps), isNull);
    });

    test('detects range drop', () {
      final reps = [
        for (var i = 0; i < 4; i++) rep(i * 2500, 2500, 70, 130),
        rep(10000, 2500, 85, 130), // 45 vs 60 baseline: -25%
        rep(12500, 2500, 90, 130),
      ];
      expect(detectFatigue(reps), 5);
    });

    test('detects tempo slowdown', () {
      final reps = [
        for (var i = 0; i < 3; i++) rep(i * 2000, 2000, 70, 130),
        rep(6000, 2000, 70, 130),
        rep(8000, 3000, 70, 130), // 50% slower
      ];
      expect(detectFatigue(reps), 5);
    });

    test('needs 5 reps', () {
      expect(detectFatigue([for (var i = 0; i < 4; i++) rep(i * 2000, 2000, 70, 130)]), isNull);
    });

    test('tips flag short range and fast tempo', () {
      final ex = exerciseById('press'); // minRange 50, tempo >= 1800
      final reps = [for (var i = 0; i < 5; i++) rep(i * 1000, 1000, 90, 120)];
      final s = summarize(reps, ex);
      final titles = s.tips.map((t) => t.title).toList();
      expect(titles, contains('Rango corto'));
      expect(titles, contains('Demasiado rápido'));
    });

    test('too few reps gives one info tip', () {
      final s = summarize([rep(0, 2000, 70, 130)], exerciseById('press'));
      expect(s.tips.single.level, TipLevel.info);
    });
  });

  group('progress', () {
    final mon = DateTime(2026, 9, 28); // Monday

    test('weekStart is Monday', () {
      expect(weekStart(DateTime(2026, 10, 4)), mon);
      expect(weekStart(mon), mon);
    });

    test('counts distinct training days', () {
      final sets = [set(mon.add(const Duration(hours: 9))), set(mon.add(const Duration(hours: 18))), set(mon.add(const Duration(days: 2)))];
      expect(trainingDaysInWeek(sets, mon.add(const Duration(days: 3))), 2);
    });

    test('streak counts weeks that met the goal, skipping an unfinished current week', () {
      final now = DateTime(2026, 10, 6); // Tuesday of the week after
      final sets = <SetRecord>[
        for (var w = 0; w < 2; w++)
          for (var d = 0; d < 3; d++) set(mon.subtract(Duration(days: 7 * w)).add(Duration(days: d, hours: 10))),
      ];
      expect(weeklyStreak(sets, 3, now), 2);
      expect(weeklyStreak(sets, 4, now), 0);
    });

    test('arm comparison gap', () {
      final now = DateTime(2026, 10, 5);
      final sets = [
        set(now.subtract(const Duration(days: 2)), arm: Arm.right, range: 60),
        set(now.subtract(const Duration(days: 3)), arm: Arm.left, range: 45),
      ];
      final c = compareArms(sets, 'press', now);
      expect(c.hasBoth, isTrue);
      expect(c.rangeGapPct, closeTo(25, 1e-9));
    });

    test('pain events only include reported pain', () {
      final a = set(DateTime(2026, 10, 1))..painZone = PainZone.wrist..painLevel = 2;
      final b = set(DateTime(2026, 10, 2));
      expect(painEvents([a, b]).single, a);
    });
  });

  test('SetRecord survives a JSON round trip', () {
    final s = set(DateTime(2026, 10, 1, 8, 30))
      ..painZone = PainZone.elbow
      ..painLevel = 1
      ..note = 'ok'
      ..marks = [1200];
    final back = SetRecord.fromJson(s.toJson());
    expect(back.exerciseId, 'press');
    expect(back.painZone, PainZone.elbow);
    expect(back.marks, [1200]);
    expect(back.reps.single.range, 50);
  });

  test('Plan survives a JSON round trip', () {
    const p = Plan(weeklyGoal: 4, days: {1: 'press', 4: 'cup'}, remindersOn: true, reminderHour: 7, reminderMinute: 30);
    final back = Plan.fromJson(p.toJson());
    expect(back.days, {1: 'press', 4: 'cup'});
    expect(back.reminderMinute, 30);
    expect(back.remindersOn, isTrue);
  });
}
