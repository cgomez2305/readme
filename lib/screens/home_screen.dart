import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/fulcro_logo.dart';
import '../widgets/glass.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onAnalyze});
  final VoidCallback onAnalyze;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 120),
      children: [
        Row(children: [
          const FulcroLogo(size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('LUNES · SEMANA 14', style: TextStyle(fontSize: 11, letterSpacing: 1.4, color: FulcroColors.muted)),
              Text('Hola, atleta', style: displayStyle(size: 21, weight: FontWeight.w500)),
            ]),
          ),
        ]),
        const SizedBox(height: 16),
        Glass(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('SESIÓN DE HOY', style: TextStyle(fontSize: 11, letterSpacing: 1.4, color: FulcroColors.muted)),
            const SizedBox(height: 6),
            Row(children: [
              const Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Press lateral', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                  Text('4 series · 8 reps · polea baja', style: TextStyle(color: FulcroColors.muted, fontSize: 13)),
                ]),
              ),
              const Pill('Muñeca', color: FulcroColors.warn),
            ]),
            const SizedBox(height: 14),
            GradientButton(label: 'Grabar y analizar', onPressed: onAnalyze),
          ]),
        ),
        const SizedBox(height: 14),
        Glass(
          child: Row(children: [
            SizedBox(
              width: 84,
              height: 84,
              child: Stack(alignment: Alignment.center, children: [
                SizedBox.expand(
                  child: CircularProgressIndicator(
                    value: 5 / 7,
                    strokeWidth: 8,
                    strokeCap: StrokeCap.round,
                    backgroundColor: Colors.white12,
                    color: FulcroColors.copper,
                  ),
                ),
                Text('5/7', style: displayStyle(size: 17)),
              ]),
            ),
            const SizedBox(width: 16),
            const Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Meta semanal', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                Text('Te faltan 2 sesiones. Racha de 3 semanas.', style: TextStyle(color: FulcroColors.muted, fontSize: 13)),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: _metric('Ángulo de codo', '101°', '+4° vs. mes pasado', FulcroColors.teal)),
          const SizedBox(width: 12),
          Expanded(child: _metric('Simetría', '94%', 'Mano izq. −6%', FulcroColors.warn)),
        ]),
        const SizedBox(height: 14),
        Glass(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Ángulo por repetición', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            SizedBox(
              height: 64,
              child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                for (final (i, h) in [.78, .82, .80, .76, .58, .52, .46, .42].indexed) ...[
                  if (i > 0) const SizedBox(width: 6),
                  Expanded(
                    child: FractionallySizedBox(
                      heightFactor: h,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(6), bottom: Radius.circular(3)),
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [i >= 4 ? FulcroColors.warn : FulcroColors.teal, Colors.transparent],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ]),
            ),
            const SizedBox(height: 10),
            const Text('Desde la rep 5 tu codo se abre. Es el primer signo de fatiga.',
                style: TextStyle(color: FulcroColors.muted, fontSize: 13)),
          ]),
        ),
        const SizedBox(height: 10),
        const Center(child: Text('Datos de ejemplo', style: TextStyle(fontSize: 11, color: FulcroColors.muted))),
      ],
    );
  }

  Widget _metric(String label, String value, String chip, Color color) => Glass(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(color: FulcroColors.muted, fontSize: 12)),
          const SizedBox(height: 4),
          Text(value, style: displayStyle(size: 24)),
          const SizedBox(height: 6),
          Pill(chip, color: color),
        ]),
      );
}
