import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class FulcroColors {
  static const ink = Color(0xFF07080C);
  static const panel = Color(0xFF0E1118);
  static const text = Color(0xFFF2F4F8);
  static const muted = Color(0xFF9AA3B5);
  static const copper = Color(0xFFFF8A4C);
  static const teal = Color(0xFF3FE0C5);
  static const amber = Color(0xFFFFC27A);
  static const warn = Color(0xFFFFB347);
  static const glass = Color(0x12FFFFFF);
  static const glassStrong = Color(0x1FFFFFFF);
  static const edge = Color(0x24FFFFFF);

  static const accentGradient = LinearGradient(
    begin: Alignment.bottomLeft,
    end: Alignment.topRight,
    colors: [copper, amber],
  );
}

ThemeData buildTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  final body = GoogleFonts.figtreeTextTheme(base.textTheme).apply(
    bodyColor: FulcroColors.text,
    displayColor: FulcroColors.text,
  );
  return base.copyWith(
    scaffoldBackgroundColor: FulcroColors.panel,
    colorScheme: base.colorScheme.copyWith(
      primary: FulcroColors.copper,
      secondary: FulcroColors.teal,
      surface: FulcroColors.panel,
    ),
    textTheme: body,
  );
}

TextStyle displayStyle({double size = 24, FontWeight weight = FontWeight.w700}) =>
    GoogleFonts.unbounded(fontSize: size, fontWeight: weight, color: FulcroColors.text);
