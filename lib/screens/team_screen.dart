import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/glass.dart';

class TeamScreen extends StatelessWidget {
  const TeamScreen({super.key});

  static const _members = [
    ('Marcos', 'Top roll · hoy', 6),
    ('Tú', 'Press · hoy', 5),
    ('Luis', 'Hook · ayer', 4),
    ('Diego', 'Pronación · hace 2 días', 3),
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 120),
      children: [
        const Text('GRUPO DE ENTRENAMIENTO', style: TextStyle(fontSize: 11, letterSpacing: 1.4, color: FulcroColors.muted)),
        Text('Equipo', style: displayStyle(size: 22, weight: FontWeight.w500)),
        const SizedBox(height: 14),
        Glass(
          child: Row(children: [
            Text('23', style: displayStyle(size: 30)),
            const SizedBox(width: 12),
            const Expanded(child: Text('sesiones esta semana', style: TextStyle(color: FulcroColors.muted))),
            const Pill('+4', color: FulcroColors.teal),
          ]),
        ),
        const SizedBox(height: 14),
        Glass(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (final (i, m) in _members.indexed) ...[
              if (i > 0) const Divider(height: 1, color: FulcroColors.edge),
              ListTile(
                leading: CircleAvatar(
                  backgroundColor: FulcroColors.copper,
                  foregroundColor: const Color(0xFF1A0D05),
                  child: Text(m.$1[0], style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
                title: Text(m.$1, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(m.$2, style: const TextStyle(color: FulcroColors.muted, fontSize: 13)),
                trailing: Text('${m.$3}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              ),
            ],
          ]),
        ),
        const SizedBox(height: 20),
        const Text('Planes', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        const Glass(
          borderColor: Color(0x803FE0C5),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Grupo', style: TextStyle(fontWeight: FontWeight.w700)),
                Text('Hasta 10 atletas. Análisis ilimitado.', style: TextStyle(color: FulcroColors.muted, fontSize: 13)),
              ]),
            ),
            Pill('Actual', color: FulcroColors.teal),
          ]),
        ),
        const SizedBox(height: 10),
        const Glass(
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Pro', style: TextStyle(fontWeight: FontWeight.w700)),
                Text('Comparación con referencias y plan adaptativo.', style: TextStyle(color: FulcroColors.muted, fontSize: 13)),
              ]),
            ),
            Text('Próximamente', style: TextStyle(fontSize: 11, color: FulcroColors.amber)),
          ]),
        ),
        const SizedBox(height: 10),
        const Center(child: Text('Datos de ejemplo', style: TextStyle(fontSize: 11, color: FulcroColors.muted))),
      ],
    );
  }
}
