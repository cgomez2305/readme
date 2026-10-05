import 'dart:math' as math;

import '../data/models.dart';

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

/// Builds repetitions from a stream of (time, angle) samples.
///
/// A rep starts when the angle drops below [openAbove], is valid once it goes below
/// [closedBelow], and ends when the angle returns above [openAbove]. Partial moves that
/// never reach [closedBelow] are discarded. The range uses the highest angle seen
/// before the drop, so it covers the whole movement.
class RepTracker {
  RepTracker({required this.openAbove, required this.closedBelow});

  final double openAbove;
  final double closedBelow;
  final List<RepData> reps = [];

  bool _inRep = false;
  bool _reached = false;
  int _startMs = 0;
  double _min = 180;
  double _max = 0;
  double _openPeak = 0;
  double _wristSum = 0;
  int _wristN = 0;

  /// Current angle state, useful for live feedback.
  bool get inRep => _inRep;

  void add(int tMs, double angle, {double? wrist}) {
    if (!_inRep) {
      if (angle >= openAbove) {
        if (angle > _openPeak) _openPeak = angle;
        return;
      }
      _inRep = true;
      _reached = false;
      _startMs = tMs;
      _min = angle;
      _max = angle > _openPeak ? angle : _openPeak;
      _wristSum = 0;
      _wristN = 0;
    }

    if (angle < _min) _min = angle;
    if (angle > _max) _max = angle;
    if (wrist != null) {
      _wristSum += wrist;
      _wristN++;
    }
    if (angle < closedBelow) _reached = true;

    if (angle >= openAbove) {
      if (_reached) {
        reps.add(RepData(
          startMs: _startMs,
          endMs: tMs,
          minAngle: _min,
          maxAngle: _max,
          wristAvg: _wristN == 0 ? null : _wristSum / _wristN,
        ));
      }
      _inRep = false;
      _openPeak = angle;
    }
  }

  void reset() {
    reps.clear();
    _inRep = false;
    _reached = false;
    _openPeak = 0;
  }
}
