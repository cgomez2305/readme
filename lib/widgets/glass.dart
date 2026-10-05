import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Translucent blurred panel used for every card in the app.
class Glass extends StatelessWidget {
  const Glass({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.radius = 22,
    this.strong = false,
    this.borderColor,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final bool strong;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: strong ? FulcroColors.glassStrong : FulcroColors.glass,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: borderColor ?? FulcroColors.edge),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.white.withValues(alpha: .08), Colors.transparent],
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.color = FulcroColors.text});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: FulcroColors.glassStrong,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: FulcroColors.edge),
      ),
      child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class GradientButton extends StatelessWidget {
  const GradientButton({super.key, required this.label, required this.onPressed, this.ghost = false});
  final String label;
  final VoidCallback onPressed;
  final bool ghost;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onPressed,
        child: Ink(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            gradient: ghost ? null : FulcroColors.accentGradient,
            color: ghost ? FulcroColors.glassStrong : null,
            border: ghost ? Border.all(color: FulcroColors.edge) : null,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: ghost ? FulcroColors.text : const Color(0xFF1A0D05),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Dark ground with blurred copper and teal light behind the glass.
class AmbientBackground extends StatelessWidget {
  const AmbientBackground({super.key, required this.child});
  final Widget child;

  Widget _blob(Color c, double size) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: c.withValues(alpha: .5)),
      );

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const Positioned.fill(child: ColoredBox(color: FulcroColors.panel)),
        Positioned(
          top: -70,
          right: -90,
          child: ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 60, sigmaY: 60),
            child: _blob(FulcroColors.copper, 260),
          ),
        ),
        Positioned(
          bottom: 60,
          left: -120,
          child: ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 60, sigmaY: 60),
            child: _blob(const Color(0xFF12806F), 300),
          ),
        ),
        Positioned.fill(child: child),
      ],
    );
  }
}
