import 'package:flutter/material.dart';

import '../analysis/progress.dart';
import '../data/app_state.dart';
import '../data/exercises.dart';
import '../services/reminders.dart';
import '../theme/app_theme.dart';
import '../widgets/glass.dart';

/// Weekly plan: training-day goal, exercise per weekday and reminders.
class PlanScreen extends StatelessWidget {
  const PlanScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final plan = app.plan;

    Future<void> setDay(int weekday, String? exerciseId) {
      final days = Map<int, String>.of(plan.days);
      exerciseId == null ? days.remove(weekday) : days[weekday] = exerciseId;
      return app.savePlan(plan.copyWith(days: days));
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 120),
      children: [
        const Eyebrow('Organiza tu semana'),
        Text('Plan', style: displayStyle(size: 22, weight: FontWeight.w500)),
        const SizedBox(height: 14),
        Glass(
          child: Row(children: [
            const Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Meta semanal', style: TextStyle(fontWeight: FontWeight.w700)),
                Text('Días de entreno por semana', style: TextStyle(color: FulcroColors.muted, fontSize: 12)),
              ]),
            ),
            IconButton(
              onPressed: plan.weeklyGoal > 1 ? () => app.savePlan(plan.copyWith(weeklyGoal: plan.weeklyGoal - 1)) : null,
              icon: const Icon(Icons.remove_rounded),
            ),
            Text('${plan.weeklyGoal}', style: displayStyle(size: 20)),
            IconButton(
              onPressed: plan.weeklyGoal < 7 ? () => app.savePlan(plan.copyWith(weeklyGoal: plan.weeklyGoal + 1)) : null,
              icon: const Icon(Icons.add_rounded),
            ),
          ]),
        ),
        const SizedBox(height: 14),
        const Text('Días y ejercicios', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        for (var wd = 1; wd <= 7; wd++) ...[
          Glass(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            radius: 18,
            child: Row(children: [
              SizedBox(width: 92, child: Text(weekdayName[wd - 1], style: TextStyle(fontWeight: FontWeight.w600, color: DateTime.now().weekday == wd ? FulcroColors.teal : FulcroColors.text))),
              Expanded(
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String?>(
                    isExpanded: true,
                    value: plan.days[wd],
                    dropdownColor: FulcroColors.panel,
                    hint: const Text('Descanso', style: TextStyle(color: FulcroColors.muted)),
                    items: [
                      const DropdownMenuItem<String?>(value: null, child: Text('Descanso')),
                      for (final e in exercises) DropdownMenuItem<String?>(value: e.id, child: Text(e.name)),
                    ],
                    onChanged: (v) => setDay(wd, v),
                  ),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 8),
        ],
        const SizedBox(height: 10),
        Glass(
          child: Column(children: [
            Row(children: [
              const Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Recordatorios', style: TextStyle(fontWeight: FontWeight.w700)),
                  Text('Un aviso los días con ejercicio planificado', style: TextStyle(color: FulcroColors.muted, fontSize: 12)),
                ]),
              ),
              Switch(
                value: plan.remindersOn,
                onChanged: (on) async {
                  if (on) {
                    final ok = await Reminders.requestPermission();
                    if (!ok && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text('Sin permiso de notificaciones no puedo avisarte. Actívalo en Ajustes > Apps > Fulcro.'),
                      ));
                      return;
                    }
                  }
                  await app.savePlan(plan.copyWith(remindersOn: on));
                },
              ),
            ]),
            if (plan.remindersOn) ...[
              const SizedBox(height: 8),
              Row(children: [
                const Expanded(child: Text('Hora del aviso', style: TextStyle(color: FulcroColors.muted))),
                TextButton(
                  onPressed: () async {
                    final t = await showTimePicker(
                      context: context,
                      initialTime: TimeOfDay(hour: plan.reminderHour, minute: plan.reminderMinute),
                    );
                    if (t != null) await app.savePlan(plan.copyWith(reminderHour: t.hour, reminderMinute: t.minute));
                  },
                  child: Text(
                    '${plan.reminderHour.toString().padLeft(2, '0')}:${plan.reminderMinute.toString().padLeft(2, '0')}',
                    style: displayStyle(size: 18),
                  ),
                ),
              ]),
            ],
          ]),
        ),
      ],
    );
  }
}
