
import 'package:flutter/material.dart';

import '../data/exercises.dart';
import '../theme/app_theme.dart';

/// Draws the arm skeleton over the preview or the replayed video.
/// Landmarks are 0..1, so the painter must cover exactly the image area.
class ArmPainter extends CustomPainter {
  ArmPainter({required this.p, required this.joint, this.angle, this.trackedLabel = true});

  final List<double>? p;
  final Joint joint;
  final double? angle;
  final bool trackedLabel;

  @override
  void paint(Canvas canvas, Size size) {
    final v = p;
    if (v == null || v.length < 8) return;
    Offset o(int i) => Offset(v[i * 2] * size.width, v[i * 2 + 1] * size.height);
    final s = o(0), e = o(1), w = o(2), h = o(3);

    final arm = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..strokeWidth = 7
      ..shader = FulcroColors.accentGradient.createShader(Offset.zero & size);
    canvas.drawPath(Path()..moveTo(s.dx, s.dy)..lineTo(e.dx, e.dy)..lineTo(w.dx, w.dy), arm);
    canvas.drawLine(w, h, arm..strokeWidth = 5);

    final fill = Paint()..color = FulcroColors.panel;
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;
    for (final (pt, tracked) in [(s, false), (e, joint == Joint.elbow), (w, joint == Joint.wrist), (h, false)]) {
      canvas.drawCircle(pt, tracked ? 9 : 6, fill);
      canvas.drawCircle(pt, tracked ? 9 : 6, ring..color = tracked ? FulcroColors.copper : Colors.white);
    }

    if (angle != null && trackedLabel) {
      final at = joint == Joint.elbow ? e : w;
      final tp = TextPainter(
        text: TextSpan(
          text: '${angle!.round()}°',
          style: const TextStyle(
            color: FulcroColors.teal,
            fontSize: 18,
            fontWeight: FontWeight.w800,
            shadows: [Shadow(blurRadius: 6, color: Colors.black)],
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, at + const Offset(14, -28));
    }
  }

  @override
  bool shouldRepaint(covariant ArmPainter old) => old.p != p || old.angle != angle || old.joint != joint;
}

/// Dashed outline that shows where the arm should sit in the picture.
class GuidePainter extends CustomPainter {
  GuidePainter({required this.ok, required this.showArm});

  final bool ok;
  final bool showArm;

  @override
  void paint(Canvas canvas, Size size) {
    final color = (ok ? FulcroColors.teal : Colors.white).withValues(alpha: .55);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = color;

    // Safe area: keep the whole arm inside this box.
    final box = RRect.fromRectAndRadius(
      Rect.fromLTWH(size.width * .06, size.height * .08, size.width * .88, size.height * .84),
      const Radius.circular(18),
    );
    _dashPath(canvas, Path()..addRRect(box), paint);

    if (showArm) {
      Offset o(double x, double y) => Offset(x * size.width, y * size.height);
      final arm = Path()
        ..moveTo(o(.2, .3).dx, o(.2, .3).dy)
        ..lineTo(o(.4, .6).dx, o(.4, .6).dy)
        ..lineTo(o(.78, .42).dx, o(.78, .42).dy);
      _dashPath(canvas, arm, paint..strokeWidth = 6);
    }
  }

  void _dashPath(Canvas canvas, Path path, Paint paint) {
    for (final m in path.computeMetrics()) {
      var d = 0.0;
      while (d < m.length) {
        canvas.drawPath(m.extractPath(d, d + 8), paint);
        d += 16;
      }
    }
  }

  @override
  bool shouldRepaint(covariant GuidePainter old) => old.ok != ok || old.showArm != showArm;
}

