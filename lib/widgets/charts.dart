import 'package:flutter/material.dart';

import '../analysis/progress.dart';
import '../theme/app_theme.dart';

/// One bar per repetition. Bars from [highlightFrom] (0-based) on are drawn amber.
class RepBars extends StatelessWidget {
  const RepBars({
    super.key,
    required this.values,
    this.target,
    this.highlightFrom,
    this.unit = '°',
    this.height = 120,
    this.decimals = 0,
  });

  final List<double> values;
  final double? target;
  final int? highlightFrom;
  final String unit;
  final double height;
  final int decimals;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(painter: _RepBarsPainter(values, target, highlightFrom, unit, decimals)),
      );
}

class _RepBarsPainter extends CustomPainter {
  _RepBarsPainter(this.values, this.target, this.highlightFrom, this.unit, this.decimals);

  final List<double> values;
  final double? target;
  final int? highlightFrom;
  final String unit;
  final int decimals;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    const labelH = 16.0;
    final plotH = size.height - labelH;
    var top = values.reduce((a, b) => a > b ? a : b);
    if (target != null && target! > top) top = target!;
    top = top * 1.1;
    if (top <= 0) top = 1;

    final n = values.length;
    final gap = 6.0;
    final barW = ((size.width - gap * (n - 1)) / n).clamp(4.0, 40.0);
    final total = barW * n + gap * (n - 1);
    final left = (size.width - total) / 2;

    for (var i = 0; i < n; i++) {
      final h = values[i] / top * plotH;
      final x = left + i * (barW + gap);
      final warn = highlightFrom != null && i >= highlightFrom!;
      final c = warn ? FulcroColors.warn : FulcroColors.teal;
      final rect = RRect.fromRectAndCorners(
        Rect.fromLTWH(x, plotH - h, barW, h),
        topLeft: const Radius.circular(6),
        topRight: const Radius.circular(6),
        bottomLeft: const Radius.circular(2),
        bottomRight: const Radius.circular(2),
      );
      canvas.drawRRect(
        rect,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [c, c.withValues(alpha: .2)],
          ).createShader(rect.outerRect),
      );
      _text(canvas, '${i + 1}', Offset(x + barW / 2, plotH + 3), FulcroColors.muted, 10, center: true);
    }

    if (target != null) {
      final y = plotH - target! / top * plotH;
      final p = Paint()
        ..color = Colors.white.withValues(alpha: .5)
        ..strokeWidth = 1;
      for (var x = 0.0; x < size.width; x += 10) {
        canvas.drawLine(Offset(x, y), Offset(x + 5, y), p);
      }
      _text(canvas, 'objetivo ${target!.toStringAsFixed(decimals)}$unit', Offset(size.width, y - 13), FulcroColors.muted, 10,
          right: true);
    }
  }

  void _text(Canvas canvas, String s, Offset at, Color c, double size, {bool center = false, bool right = false}) {
    final tp = TextPainter(
      text: TextSpan(text: s, style: TextStyle(color: c, fontSize: size)),
      textDirection: TextDirection.ltr,
    )..layout();
    final dx = center ? at.dx - tp.width / 2 : (right ? at.dx - tp.width : at.dx);
    tp.paint(canvas, Offset(dx, at.dy));
  }

  @override
  bool shouldRepaint(covariant _RepBarsPainter old) =>
      old.values != values || old.target != target || old.highlightFrom != highlightFrom;
}

/// Line chart of one value per training day, with a faint grid and an emphasised last point.
class TrendChart extends StatelessWidget {
  const TrendChart({super.key, required this.points, this.unit = '°', this.height = 130, this.color = FulcroColors.teal});

  final List<TrendPoint> points;
  final String unit;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(painter: _TrendPainter(points, unit, color)),
      );
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.points, this.unit, this.color);

  final List<TrendPoint> points;
  final String unit;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;
    const padL = 34.0, padB = 18.0, padT = 6.0, padR = 8.0;
    final plot = Rect.fromLTWH(padL, padT, size.width - padL - padR, size.height - padT - padB);

    var lo = points.map((p) => p.value).reduce((a, b) => a < b ? a : b);
    var hi = points.map((p) => p.value).reduce((a, b) => a > b ? a : b);
    if (hi - lo < 1) {
      lo -= 1;
      hi += 1;
    }
    final pad = (hi - lo) * .15;
    lo -= pad;
    hi += pad;

    double yOf(double v) => plot.bottom - (v - lo) / (hi - lo) * plot.height;
    final t0 = points.first.date.millisecondsSinceEpoch.toDouble();
    final span = (points.last.date.millisecondsSinceEpoch - points.first.date.millisecondsSinceEpoch).toDouble();
    double xOf(int i) => points.length == 1 || span == 0
        ? plot.center.dx
        : plot.left + (points[i].date.millisecondsSinceEpoch - t0) / span * plot.width;

    final grid = Paint()
      ..color = Colors.white.withValues(alpha: .08)
      ..strokeWidth = 1;
    for (var i = 0; i <= 2; i++) {
      final v = lo + (hi - lo) * i / 2;
      final y = yOf(v);
      canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), grid);
      _text(canvas, '${v.round()}$unit', Offset(plot.left - 6, y - 6), right: true);
    }

    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final o = Offset(xOf(i), yOf(points[i].value));
      i == 0 ? path.moveTo(o.dx, o.dy) : path.lineTo(o.dx, o.dy);
    }
    if (points.length > 1) {
      final area = Path.from(path)
        ..lineTo(xOf(points.length - 1), plot.bottom)
        ..lineTo(xOf(0), plot.bottom)
        ..close();
      canvas.drawPath(
        area,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [color.withValues(alpha: .3), color.withValues(alpha: 0)],
          ).createShader(plot),
      );
      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5
          ..strokeJoin = StrokeJoin.round
          ..color = color,
      );
    }
    for (var i = 0; i < points.length; i++) {
      final o = Offset(xOf(i), yOf(points[i].value));
      final last = i == points.length - 1;
      canvas.drawCircle(o, last ? 6 : 3.5, Paint()..color = last ? FulcroColors.copper : color);
      if (last) canvas.drawCircle(o, 6, Paint()..style = PaintingStyle.stroke..strokeWidth = 2..color = FulcroColors.panel);
    }

    _text(canvas, formatDay(points.first.date), Offset(plot.left, plot.bottom + 4));
    if (points.length > 1) {
      _text(canvas, formatDay(points.last.date), Offset(plot.right, plot.bottom + 4), right: true);
    }
  }

  void _text(Canvas canvas, String s, Offset at, {bool right = false}) {
    final tp = TextPainter(
      text: TextSpan(text: s, style: const TextStyle(color: FulcroColors.muted, fontSize: 10)),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(right ? at.dx - tp.width : at.dx, at.dy));
  }

  @override
  bool shouldRepaint(covariant _TrendPainter old) => old.points != points || old.color != color;
}
