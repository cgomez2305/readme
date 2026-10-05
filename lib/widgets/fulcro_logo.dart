import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The Fulcro mark: pivot, forearm lever and the measured angle arc.
class FulcroLogo extends StatelessWidget {
  const FulcroLogo({super.key, this.size = 48});
  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: _LogoPainter());
}

class _LogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 64;
    Offset p(double x, double y) => Offset(x * s, y * s);

    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(18 * s)),
      Paint()..color = const Color(0xFF12151C),
    );

    final line = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(p(14, 46), p(50, 46), line
      ..color = Colors.white.withValues(alpha: .28)
      ..strokeWidth = 3 * s);

    canvas.drawLine(
      p(18, 46),
      p(44, 20),
      line
        ..shader = FulcroColors.accentGradient.createShader(Offset.zero & size)
        ..strokeWidth = 7 * s,
    );
    line.shader = null;

    canvas.drawArc(
      Rect.fromCircle(center: p(18, 46), radius: 12 * s),
      -0.785398, // -45 degrees
      0.785398,
      false,
      line
        ..color = FulcroColors.teal
        ..strokeWidth = 2.5 * s,
    );

    canvas.drawCircle(p(18, 46), 5 * s, Paint()..color = const Color(0xFF12151C));
    canvas.drawCircle(
      p(18, 46),
      5 * s,
      Paint()
        ..style = PaintingStyle.stroke
        ..color = FulcroColors.copper
        ..strokeWidth = 3 * s,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
