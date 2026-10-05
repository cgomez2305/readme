import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fulcro/data/app_state.dart';
import 'package:fulcro/data/models.dart';
import 'package:fulcro/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

SetRecord demo(int daysAgo, Arm arm, double range) => SetRecord(
      id: 'd$daysAgo${arm.name}',
      exerciseId: 'press',
      arm: arm,
      weightKg: 20 + daysAgo.toDouble(),
      startedAt: DateTime.now().subtract(Duration(days: daysAgo)),
      durationMs: 20000,
      reps: [for (var i = 0; i < 6; i++) RepData(startMs: i * 3000, endMs: i * 3000 + 2500, minAngle: 70, maxAngle: 70 + range - i * 3)],
      fatigueRep: 5,
    )
      ..painZone = daysAgo == 2 ? PainZone.wrist : null
      ..painLevel = daysAgo == 2 ? 2 : 0;

void main() {
  testWidgets('app opens and every tab except the camera renders with and without data', (tester) async {
    tester.view.physicalSize = const Size(1080, 2200);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    for (final withData in [false, true]) {
      SharedPreferences.setMockInitialValues({});
      // Real async work (prefs, platform channels) must run outside the fake-async test zone.
      final app = (await tester.runAsync(() async {
        final a = AppState(await SharedPreferences.getInstance());
        if (withData) {
          await a.addSet(demo(0, Arm.right, 60));
          await a.addSet(demo(2, Arm.left, 48));
          await a.addSet(demo(5, Arm.right, 55));
          await a.savePlan(const Plan(weeklyGoal: 3, days: {1: 'press', 3: 'cup'}));
        }
        return a;
      }))!;
      await tester.pumpWidget(FulcroApp(state: app));
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull, reason: 'Inicio withData=$withData');

      for (final tab in ['Progreso', 'Equipo', 'Plan', 'Inicio']) {
        await tester.tap(find.text(tab).last);
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.takeException(), isNull, reason: '$tab withData=$withData');
      }
    }
  });
}
