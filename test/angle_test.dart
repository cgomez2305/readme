import 'package:flutter_test/flutter_test.dart';
import 'package:fulcro/analysis/angle.dart';

void main() {
  test('right angle is 90 degrees', () {
    expect(jointAngle((x: 0, y: 1), (x: 0, y: 0), (x: 1, y: 0)), closeTo(90, 1e-9));
  });

  test('straight arm is 180 degrees', () {
    expect(jointAngle((x: -1, y: 0), (x: 0, y: 0), (x: 1, y: 0)), closeTo(180, 1e-9));
  });

  test('degenerate points give 0', () {
    expect(jointAngle((x: 0, y: 0), (x: 0, y: 0), (x: 1, y: 0)), 0);
  });

  test('rep counter counts a full close-and-open cycle', () {
    final c = RepCounter();
    for (final a in [150, 100, 60, 90, 130, 150, 60, 140]) {
      c.add(a.toDouble());
    }
    expect(c.reps, 2);
    expect(c.minAngle, 60);
    expect(c.range, 90);
  });

  test('wobble between thresholds is not a rep', () {
    final c = RepCounter();
    for (final a in [100, 90, 110, 95, 105]) {
      c.add(a.toDouble());
    }
    expect(c.reps, 0);
  });
}
