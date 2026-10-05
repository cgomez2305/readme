import 'package:flutter/material.dart';

import '../analysis/progress.dart';
import '../data/app_state.dart';
import '../data/exercises.dart';
import '../theme/app_theme.dart';
import '../widgets/charts.dart';
import '../widgets/fulcro_logo.dart';
import '../widgets/glass.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onAnalyze, required this.onPlan});
  final VoidCallback onAnalyze;
  final VoidCallback onPlan;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final now = DateTime.now();
    final planned = app.todayPlanned;
    final days = trainingDaysInWeek(app.sets, now);
    final goal = app.plan.weeklyGoal;
    final streak = weeklyStreak(app.sets, goal, now);
    final last = app.sets.isEmpty ? null : app.sets.first;
    final ex = planned ?? app.exercise;
    final trend = rangeTrend(app.sets, ex.id);
    final cloudName = app.cloud.displayName;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 120),
      children: [
        Row(children: [
          const FulcroLogo(size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Eyebrow('${weekdayName[now.weekday - 1]} · ${formatDay(now)}'),
              Text(cloudName.isEmpty ? 'Hola, atleta' : 'Hola, ${cloudName.split(' ').first}',
                  style: displayStyle(size: 21, weight: FontWeight.w500)),
            ]),
          ),
        ]),
        const SizedBox(height: 16),
        Glass(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Eyebrow(planned != null ? 'Sesión de hoy' : 'Sin sesión planificada hoy'),
            const SizedBox(height: 6),
            Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(ex.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                  Text('${ex.defaultSets} series · ${ex.focus}', style: const TextStyle(color: FulcroColors.muted, fontSize: 13)),
                ]),
              ),
              Pill('${app.setsToday(ex.id)}/${ex.defaultSets}', color: app.setsToday(ex.id) >= ex.defaultSets ? FulcroColors.teal : FulcroColors.text),
            ]),
            const SizedBox(height: 14),
            GradientButton(
              label: 'Grabar y analizar',
              onPressed: () {
                app.pickExercise(ex);
                onAnalyze();
              },
            ),
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
                    value: goal == 0 ? 0 : (days / goal).clamp(0.0, 1.0),
                    strokeWidth: 8,
                    strokeCap: StrokeCap.round,
                    backgroundColor: Colors.white12,
                    color: days >= goal ? FulcroColors.teal : FulcroColors.copper,
                  ),
                ),
                Text('$days/$goal', style: displayStyle(size: 17)),
              ]),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Meta semanal', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  days >= goal
                      ? 'Meta cumplida. Racha de $streak ${streak == 1 ? 'semana' : 'semanas'}.'
                      : 'Te ${goal - days == 1 ? 'falta 1 día' : 'faltan ${goal - days} días'} de entreno.${streak > 0 ? ' Racha de $streak.' : ''}',
                  style: const TextStyle(color: FulcroColors.muted, fontSize: 13),
                ),
                TextButton(
                  onPressed: onPlan,
                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 30), alignment: Alignment.centerLeft),
                  child: const Text('Ajustar plan'),
                ),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 14),
        if (last == null)
          const Glass(
            child: Text(
              'Aquí verás tu progreso. Graba tu primera serie en Analizar y se guardará con su informe.',
              style: TextStyle(color: FulcroColors.muted),
            ),
          )
        else ...[
          Glass(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Expanded(child: Text('Última serie', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                Text('${formatDay(last.startedAt)} · ${formatTime(last.startedAt)}', style: const TextStyle(color: FulcroColors.muted, fontSize: 12)),
              ]),
              const SizedBox(height: 4),
              Text('${exerciseById(last.exerciseId).name} · brazo ${last.arm.label.toLowerCase()}', style: const TextStyle(color: FulcroColors.muted, fontSize: 13)),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _mini('Reps', '${last.reps.length}')),
                Expanded(child: _mini('Rango', '${last.avgRange.round()}°')),
                Expanded(child: _mini('Tempo', '${(last.avgTempoMs / 1000).toStringAsFixed(1)} s')),
                Expanded(child: _mini('Fatiga', last.fatigueRep == null ? 'No' : 'Rep ${last.fatigueRep}')),
              ]),
            ]),
          ),
          if (trend.length > 1) ...[
            const SizedBox(height: 14),
            Glass(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Rango en ${ex.name.toLowerCase()}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                TrendChart(points: trend),
              ]),
            ),
          ],
        ],
      ],
    );
  }

  Widget _mini(String label, String value) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: FulcroColors.muted, fontSize: 11)),
        const SizedBox(height: 2),
        Text(value, style: displayStyle(size: 15)),
      ]);
}
