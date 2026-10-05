import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/glass.dart';

class TechniquesScreen extends StatelessWidget {
  const TechniquesScreen({super.key});

  static const _items = [
    ('Hook', 'Codo cerrado, bíceps y muñeca en flexión.', '12 clips'),
    ('Top roll', 'Dedos arriba, rotación y tracción hacia ti.', '9 clips'),
    ('Press', 'Empuje con el hombro y el pecho.', '7 clips'),
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 120),
      children: [
        const Text('BIBLIOTECA DE REFERENCIA', style: TextStyle(fontSize: 11, letterSpacing: 1.4, color: FulcroColors.muted)),
        Text('Técnicas', style: displayStyle(size: 22, weight: FontWeight.w500)),
        const SizedBox(height: 14),
        for (final t in _items) ...[
          Glass(
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(t.$1, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 2),
                  Text(t.$2, style: const TextStyle(color: FulcroColors.muted, fontSize: 13)),
                ]),
              ),
              const SizedBox(width: 10),
              Pill(t.$3),
            ]),
          ),
          const SizedBox(height: 12),
        ],
        const Glass(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Comparar con tu ejecución', style: TextStyle(fontWeight: FontWeight.w700)),
            SizedBox(height: 2),
            Text('Disponible en la versión Pro. Superpone tu esqueleto sobre la referencia.',
                style: TextStyle(color: FulcroColors.muted, fontSize: 13)),
          ]),
        ),
        const SizedBox(height: 10),
        const Center(child: Text('Contenido de ejemplo', style: TextStyle(fontSize: 11, color: FulcroColors.muted))),
      ],
    );
  }
}
