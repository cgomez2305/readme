import 'package:flutter/material.dart';

import '../analysis/progress.dart';
import '../data/app_state.dart';
import '../data/exercises.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/charts.dart';
import '../widgets/glass.dart';
import 'report_screen.dart';

/// History and progress: weekly summary, trends per exercise, arm comparison,
/// pain log and the list of saved sets.
class ProgressScreen extends StatefulWidget {
  const ProgressScreen({super.key});

  @override
  State<ProgressScreen> createState() => _ProgressScreenState();
}

class _ProgressScreenState extends State<ProgressScreen> {
  String _exerciseId = exercises.first.id;
  bool _picked = false;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final now = DateTime.now();
    // Default to the exercise trained most recently, until the user chooses one.
    if (!_picked && app.sets.isNotEmpty) _exerciseId = app.sets.first.exerciseId;
    final ex = exerciseById(_exerciseId);

    final trend = rangeTrend(app.sets, ex.id);
    final weights = weightTrend(app.sets, ex.id);
    final cmp = compareArms(app.sets, ex.id, now);
    final pain = painEvents(app.sets).take(5).toList();
    final exerciseSets = app.sets.where((s) => s.exerciseId == ex.id).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 120),
      children: [
        const Eyebrow('Historial'),
        Text('Progreso', style: displayStyle(size: 22, weight: FontWeight.w500)),
        const SizedBox(height: 14),
        _week(app, now),
        const SizedBox(height: 14),
        SizedBox(
          height: 40,
          child: ListView(scrollDirection: Axis.horizontal, children: [
            for (final e in exercises)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(e.name),
                  selected: e.id == ex.id,
                  onSelected: (_) => setState(() {
                    _exerciseId = e.id;
                    _picked = true;
                  }),
                ),
              ),
          ]),
        ),
        const SizedBox(height: 14),
        if (exerciseSets.isEmpty)
          Glass(child: Text('Todavía no hay series de ${ex.name.toLowerCase()}. Grábalas en Analizar.', style: const TextStyle(color: FulcroColors.muted)))
        else ...[
          Glass(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Rango medio por día (${ex.jointLabel.toLowerCase()})', style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              TrendChart(points: trend),
            ]),
          ),
          if (weights.length > 1 && weights.any((w) => w.value > 0)) ...[
            const SizedBox(height: 14),
            Glass(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Peso máximo por día', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                TrendChart(points: weights, unit: ' kg', color: FulcroColors.copper),
              ]),
            ),
          ],
          const SizedBox(height: 14),
          _armCompare(cmp),
        ],
        if (pain.isNotEmpty) ...[
          const SizedBox(height: 14),
          Glass(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Dolor reportado', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              const Text('Compara las fechas con el peso que usabas ese día.', style: TextStyle(color: FulcroColors.muted, fontSize: 12)),
              const SizedBox(height: 8),
              for (final s in pain)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: s.painLevel >= 3 ? const Color(0xFFFF5A5A) : FulcroColors.warn)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '${formatDay(s.startedAt)} · ${s.painZone!.label} (${const ['', 'leve', 'moderado', 'fuerte'][s.painLevel]})',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                    Text('${exerciseById(s.exerciseId).name} · ${s.weightKg % 1 == 0 ? s.weightKg.toInt() : s.weightKg} kg',
                        style: const TextStyle(color: FulcroColors.muted, fontSize: 12)),
                  ]),
                ),
            ]),
          ),
        ],
        const SizedBox(height: 20),
        const Text('Series guardadas', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        if (app.sets.isEmpty)
          const Text('Aún no hay series.', style: TextStyle(color: FulcroColors.muted))
        else
          for (final s in app.sets.take(30)) ...[_SetTile(s), const SizedBox(height: 8)],
      ],
    );
  }

  Widget _week(AppState app, DateTime now) {
    final start = weekStart(now);
    final trained = {
      for (final s in app.sets)
        if (!s.startedAt.isBefore(start)) dayOf(s.startedAt)
    };
    final goal = app.plan.weeklyGoal;
    final days = trainingDaysInWeek(app.sets, now);
    return Glass(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Expanded(child: Text('Esta semana', style: TextStyle(fontWeight: FontWeight.w700))),
          Pill('$days de $goal días', color: days >= goal ? FulcroColors.teal : FulcroColors.text),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          for (var i = 0; i < 7; i++)
            Expanded(
              child: Column(children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: trained.contains(start.add(Duration(days: i))) ? FulcroColors.accentGradient : null,
                    color: trained.contains(start.add(Duration(days: i))) ? null : FulcroColors.glassStrong,
                    border: Border.all(color: start.add(Duration(days: i)) == dayOf(now) ? FulcroColors.teal : Colors.transparent, width: 2),
                  ),
                  child: trained.contains(start.add(Duration(days: i))) ? const Icon(Icons.check_rounded, size: 18, color: Color(0xFF1A0D05)) : null,
                ),
                const SizedBox(height: 4),
                Text(weekdayShort[i], style: const TextStyle(fontSize: 11, color: FulcroColors.muted)),
              ]),
            ),
        ]),
      ]),
    );
  }

  Widget _armCompare(ArmComparison c) {
    return Glass(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Brazo derecho vs. izquierdo', style: TextStyle(fontWeight: FontWeight.w700)),
        const Text('Últimos 30 días', style: TextStyle(color: FulcroColors.muted, fontSize: 12)),
        const SizedBox(height: 12),
        if (!c.hasBoth)
          const Text('Graba series con los dos brazos para compararlos.', style: TextStyle(color: FulcroColors.muted, fontSize: 13))
        else ...[
          _armBar('Derecho', c.rightRange, c.leftRange > c.rightRange ? c.leftRange : c.rightRange, '${c.rightSets} series'),
          const SizedBox(height: 8),
          _armBar('Izquierdo', c.leftRange, c.leftRange > c.rightRange ? c.leftRange : c.rightRange, '${c.leftSets} series'),
          const SizedBox(height: 12),
          Text(
            c.rangeGapPct.abs() < 5
                ? 'Rango equilibrado entre los dos brazos.'
                : 'El brazo ${c.rangeGapPct > 0 ? 'izquierdo' : 'derecho'} tiene ${c.rangeGapPct.abs().round()}% menos rango. Dale una serie extra.',
            style: TextStyle(color: c.rangeGapPct.abs() < 5 ? FulcroColors.teal : FulcroColors.warn, fontSize: 13),
          ),
          const SizedBox(height: 4),
          Text(
            'Tempo medio: derecho ${(c.rightTempoMs / 1000).toStringAsFixed(1)} s · izquierdo ${(c.leftTempoMs / 1000).toStringAsFixed(1)} s',
            style: const TextStyle(color: FulcroColors.muted, fontSize: 12),
          ),
        ],
      ]),
    );
  }

  Widget _armBar(String label, double value, double max, String sub) => Row(children: [
        SizedBox(width: 78, child: Text(label, style: const TextStyle(fontSize: 13))),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: max == 0 ? 0 : value / max,
              minHeight: 12,
              backgroundColor: Colors.white10,
              color: FulcroColors.teal,
            ),
          ),
        ),
        SizedBox(width: 56, child: Text('${value.round()}°', textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700))),
      ]);
}

class _SetTile extends StatelessWidget {
  const _SetTile(this.s);
  final SetRecord s;

  @override
  Widget build(BuildContext context) {
    final ex = exerciseById(s.exerciseId);
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReportScreen(record: s, isNew: false))),
      child: Glass(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        radius: 18,
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ex.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(
                '${formatDay(s.startedAt)} · brazo ${s.arm.label.toLowerCase()} · ${s.weightKg % 1 == 0 ? s.weightKg.toInt() : s.weightKg} kg',
                style: const TextStyle(color: FulcroColors.muted, fontSize: 12),
              ),
            ]),
          ),
          if (s.videoPath != null) const Padding(padding: EdgeInsets.only(right: 8), child: Icon(Icons.videocam_rounded, size: 18, color: FulcroColors.muted)),
          if (s.painZone != null) const Padding(padding: EdgeInsets.only(right: 8), child: Icon(Icons.healing_rounded, size: 18, color: FulcroColors.warn)),
          Text('${s.reps.length} reps · ${s.avgRange.round()}°', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        ]),
      ),
    );
  }
}
