import 'dart:ui';

import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';

import '../data/models.dart';
import 'angle.dart';

/// Arm landmarks of one frame in upright 0..1 coordinates, plus both joint angles.
class ArmReading {
  const ArmReading({required this.p, required this.elbowAngle, required this.wristAngle, required this.confidence});

  /// shoulder x,y · elbow x,y · wrist x,y · index finger x,y
  final List<double> p;
  final double elbowAngle;
  final double wristAngle;
  final double confidence;

  Offset point(int i) => Offset(p[i * 2], p[i * 2 + 1]);

  /// True when shoulder, elbow, wrist and hand are all inside the frame.
  bool get inFrame => p.every((v) => v > 0.02 && v < 0.98);
}

({PoseLandmarkType s, PoseLandmarkType e, PoseLandmarkType w, PoseLandmarkType i}) _types(Arm arm) =>
    arm == Arm.left
        ? (
            s: PoseLandmarkType.leftShoulder,
            e: PoseLandmarkType.leftElbow,
            w: PoseLandmarkType.leftWrist,
            i: PoseLandmarkType.leftIndex,
          )
        : (
            s: PoseLandmarkType.rightShoulder,
            e: PoseLandmarkType.rightElbow,
            w: PoseLandmarkType.rightWrist,
            i: PoseLandmarkType.rightIndex,
          );

/// Reads the chosen arm from [pose]. [upright] is the image size after rotation.
/// Returns null when the arm is not confidently detected.
ArmReading? readArm(Pose pose, Arm arm, Size upright, {double minConfidence = 0.5}) {
  final t = _types(arm);
  final s = pose.landmarks[t.s], e = pose.landmarks[t.e], w = pose.landmarks[t.w], i = pose.landmarks[t.i];
  if (s == null || e == null || w == null || i == null) return null;
  final conf = [s, e, w, i].map((l) => l.likelihood).reduce((a, b) => a < b ? a : b);
  if (conf < minConfidence) return null;

  double nx(PoseLandmark l) => l.x / upright.width;
  double ny(PoseLandmark l) => l.y / upright.height;
  ({double x, double y}) pt(PoseLandmark l) => (x: l.x, y: l.y);

  return ArmReading(
    p: [nx(s), ny(s), nx(e), ny(e), nx(w), ny(w), nx(i), ny(i)],
    elbowAngle: jointAngle(pt(s), pt(e), pt(w)),
    wristAngle: jointAngle(pt(e), pt(w), pt(i)),
    confidence: conf,
  );
}
