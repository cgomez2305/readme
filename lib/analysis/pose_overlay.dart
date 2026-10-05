import 'package:flutter/material.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';
import '../theme/app_theme.dart';

/// Draws the arm skeleton (shoulder, elbow, wrist) over the camera preview.
class PoseOverlay extends CustomPainter {
  PoseOverlay({required this.pose, required this.imageSize, required this.side, this.angle});

  final Pose? pose;
  final Size imageSize;
  final ArmSide side;
  final double? angle;

  @override
  void paint(Canvas canvas, Size size) {
    final p = pose;
    if (p == null) return;
    final shoulder = p.landmarks[side.shoulder];
    final elbow = p.landmarks[side.elbow];
    final wrist = p.landmarks[side.wrist];
    if (shoulder == null || elbow == null || wrist == null) return;

    Offset map(PoseLandmark l) =>
        Offset(l.x / imageSize.width * size.width, l.y / imageSize.height * size.height);

    final s = map(shoulder), e = map(elbow), w = map(wrist);
    final line = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..strokeWidth = 7
      ..shader = FulcroColors.accentGradient.createShader(Offset.zero & size);
    canvas.drawPath(Path()..moveTo(s.dx, s.dy)..lineTo(e.dx, e.dy)..lineTo(w.dx, w.dy), line);

    final joint = Paint()..color = FulcroColors.panel;
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..color = Colors.white;
    for (final o in [s, w]) {
      canvas.drawCircle(o, 7, joint);
      canvas.drawCircle(o, 7, ring);
    }
    canvas.drawCircle(e, 8, joint);
    canvas.drawCircle(e, 8, ring..color = FulcroColors.copper);

    if (angle != null) {
      final tp = TextPainter(
        text: TextSpan(
          text: '${angle!.round()}°',
          style: const TextStyle(color: FulcroColors.teal, fontSize: 18, fontWeight: FontWeight.w800),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, e + const Offset(14, -28));
    }
  }

  @override
  bool shouldRepaint(covariant PoseOverlay old) => true;
}

/// Which arm is analysed. Chosen automatically from landmark confidence.
enum ArmSide {
  left(PoseLandmarkType.leftShoulder, PoseLandmarkType.leftElbow, PoseLandmarkType.leftWrist),
  right(PoseLandmarkType.rightShoulder, PoseLandmarkType.rightElbow, PoseLandmarkType.rightWrist);

  const ArmSide(this.shoulder, this.elbow, this.wrist);
  final PoseLandmarkType shoulder;
  final PoseLandmarkType elbow;
  final PoseLandmarkType wrist;
}
