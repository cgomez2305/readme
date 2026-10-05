import 'dart:math' as math;

/// Interior angle in degrees at [b] formed by points [a]-[b]-[c].
double jointAngle(
  ({double x, double y}) a,
  ({double x, double y}) b,
  ({double x, double y}) c,
) {
  final v1x = a.x - b.x, v1y = a.y - b.y;
  final v2x = c.x - b.x, v2y = c.y - b.y;
  final dot = v1x * v2x + v1y * v2y;
  final mag = math.sqrt(v1x * v1x + v1y * v1y) * math.sqrt(v2x * v2x + v2y * v2y);
  if (mag == 0) return 0;
  return math.acos((dot / mag).clamp(-1.0, 1.0)) * 180 / math.pi;
}

/// Counts repetitions from a stream of angles using hysteresis:
/// a rep is one trip from above [openAbove] to below [closedBelow] and back.
class RepCounter {
  RepCounter({this.openAbove = 120, this.closedBelow = 70});

  final double openAbove;
  final double closedBelow;
  int reps = 0;
  double minAngle = 180;
  double maxAngle = 0;
  bool _closed = false;

  void add(double angle) {
    if (angle < minAngle) minAngle = angle;
    if (angle > maxAngle) maxAngle = angle;
    if (!_closed && angle < closedBelow) {
      _closed = true;
    } else if (_closed && angle > openAbove) {
      _closed = false;
      reps++;
    }
  }

  void reset() {
    reps = 0;
    minAngle = 180;
    maxAngle = 0;
    _closed = false;
  }

  double get range => maxAngle >= minAngle ? maxAngle - minAngle : 0;
}
