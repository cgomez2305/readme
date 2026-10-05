import 'package:flutter_test/flutter_test.dart';
import 'package:fulcro/data/app_state.dart';
import 'package:fulcro/data/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

SetRecord makeSet(DateTime at, {String id = 'a'}) => SetRecord(
      id: id,
      exerciseId: 'press',
      arm: Arm.left,
      weightKg: 22.5,
      startedAt: at,
      durationMs: 9000,
      reps: [const RepData(startMs: 0, endMs: 2000, minAngle: 70, maxAngle: 130)],
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('saved sets and plan are restored on the next launch', () async {
    final prefs = await SharedPreferences.getInstance();
    final first = AppState(prefs);
    await first.addSet(makeSet(DateTime(2026, 10, 1, 8), id: 'a'));
    await first.addSet(makeSet(DateTime(2026, 10, 3, 8), id: 'b'));
    await first.savePlan(const Plan(weeklyGoal: 4, days: {2: 'cup'}));

    final second = AppState(prefs);
    expect(second.sets.map((s) => s.id), ['b', 'a']); // newest first
    expect(second.sets.first.weightKg, 22.5);
    expect(second.plan.weeklyGoal, 4);
    expect(second.plan.days, {2: 'cup'});
  });

  test('editing and deleting a set persists', () async {
    final prefs = await SharedPreferences.getInstance();
    final app = AppState(prefs);
    final s = makeSet(DateTime(2026, 10, 1));
    await app.addSet(s);
    s
      ..note = 'muñeca cargada'
      ..painZone = PainZone.wrist
      ..painLevel = 2;
    await app.updateSet(s);
    expect(AppState(prefs).sets.single.painZone, PainZone.wrist);

    await app.deleteSet(s);
    expect(AppState(prefs).sets, isEmpty);
  });

  test('counts sets done today per exercise', () async {
    final prefs = await SharedPreferences.getInstance();
    final app = AppState(prefs);
    await app.addSet(makeSet(DateTime.now(), id: 'x'));
    await app.addSet(makeSet(DateTime.now().subtract(const Duration(days: 2)), id: 'y'));
    expect(app.setsToday('press'), 1);
    expect(app.setsToday('cup'), 0);
  });

  test('corrupt history does not crash the app', () async {
    SharedPreferences.setMockInitialValues({'sets_v1': 'not json'});
    final app = AppState(await SharedPreferences.getInstance());
    expect(app.sets, isEmpty);
  });

  test('rest timer counts down and can be extended or skipped', () async {
    final app = AppState(await SharedPreferences.getInstance())..setRestSeconds(60);
    app.startRest();
    expect(app.restLeft, 60);
    app.addRest(30);
    expect(app.restLeft, 90);
    app.cancelRest();
    expect(app.restLeft, isNull);
  });
}
