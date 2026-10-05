import 'package:flutter/material.dart';

import '../analysis/progress.dart';
import '../analysis/set_summary.dart';
import '../data/app_state.dart';
import '../data/exercises.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/charts.dart';
import '../widgets/glass.dart';
import 'replay_screen.dart';

/// Report of one series. For a new series it offers Save / Discard; for a saved one
/// it allows editing notes and pain, watching the video and deleting.
class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key, required this.record, required this.isNew, this.frames = const [], this.tempVideoPath});

  final SetRecord record;
  final bool isNew;
  final List<PoseFrame> frames;
  final String? tempVideoPath;

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  late final TextEditingController _note = TextEditingController(text: widget.record.note);
  bool _saving = false;

  SetRecord get r => widget.record;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _save(AppState app) async {
    setState(() => _saving = true);
    r.note = _note.text.trim();
    if (widget.isNew) {
      await app.addSet(r, frames: widget.frames, tempVideoPath: widget.tempVideoPath);
    } else {
      await app.updateSet(r);
    }
    if (mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final ex = exerciseById(r.exerciseId);
    final s = summarize(r.reps, ex);
    final hasVideo = !widget.isNew && r.videoPath != null;

    return Scaffold(
      body: AmbientBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 40),
            children: [
              Row(children: [
                IconButton(onPressed: () => Navigator.pop(context, false), icon: const Icon(Icons.arrow_back_rounded)),
                Expanded(child: Eyebrow(widget.isNew ? 'Informe de la serie' : '${formatDay(r.startedAt)} · ${formatTime(r.startedAt)}')),
              ]),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(ex.name, style: displayStyle(size: 22, weight: FontWeight.w500)),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 14),
                child: Text(
                  'Brazo ${r.arm.label.toLowerCase()} · ${r.weightKg % 1 == 0 ? r.weightKg.toInt() : r.weightKg} kg · ${(r.durationMs / 1000).round()} s',
                  style: const TextStyle(color: FulcroColors.muted, fontSize: 13),
                ),
              ),
              Row(children: [
                Expanded(child: MetricCard(label: 'Repeticiones', value: '${s.reps}')),
                const SizedBox(width: 12),
                Expanded(
                  child: MetricCard(
                    label: 'Rango medio',
                    value: s.reps == 0 ? '--' : '${s.avgRange.round()}°',
                    pill: s.reps == 0 ? null : (s.avgRange >= ex.minRange ? 'En objetivo' : 'Corto'),
                    pillColor: s.avgRange >= ex.minRange ? FulcroColors.teal : FulcroColors.warn,
                  ),
                ),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: MetricCard(
                    label: 'Tempo por rep',
                    value: s.reps == 0 ? '--' : '${(s.avgTempoMs / 1000).toStringAsFixed(1)} s',
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: MetricCard(
                    label: 'Fatiga',
                    value: s.fatigueRep == null ? 'No' : 'Rep ${s.fatigueRep}',
                    pill: s.reps < 5 ? 'Necesita 5 reps' : null,
                    pillColor: FulcroColors.muted,
                  ),
                ),
              ]),
              if (s.reps > 0) ...[
                const SizedBox(height: 14),
                Glass(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Rango por repetición (${ex.jointLabel.toLowerCase()})', style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    RepBars(
                      values: r.reps.map((e) => e.range).toList(),
                      target: ex.minRange,
                      highlightFrom: s.fatigueRep == null ? null : s.fatigueRep! - 1,
                    ),
                    const SizedBox(height: 16),
                    const Text('Duración por repetición', style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    RepBars(
                      values: r.reps.map((e) => e.durationMs / 1000).toList(),
                      unit: ' s',
                      decimals: 1,
                      height: 90,
                      highlightFrom: s.fatigueRep == null ? null : s.fatigueRep! - 1,
                    ),
                  ]),
                ),
              ],
              const SizedBox(height: 14),
              for (final t in s.tips) ...[_TipCard(t), const SizedBox(height: 10)],
              const SizedBox(height: 4),
              Glass(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('¿Sentiste dolor?', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final z in PainZone.values)
                      ChoiceChip(
                        label: Text(z.label),
                        selected: r.painZone == z,
                        onSelected: (on) => setState(() {
                          r.painZone = on ? z : null;
                          if (!on) r.painLevel = 0;
                          if (on && r.painLevel == 0) r.painLevel = 1;
                        }),
                      ),
                  ]),
                  if (r.painZone != null) ...[
                    const SizedBox(height: 12),
                    Segmented<int>(
                      options: const [1, 2, 3],
                      value: r.painLevel == 0 ? 1 : r.painLevel,
                      onChanged: (v) => setState(() => r.painLevel = v),
                      label: (v) => const ['', 'Leve', 'Moderado', 'Fuerte'][v],
                    ),
                  ],
                  const SizedBox(height: 12),
                  TextField(
                    controller: _note,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: 'Notas de la serie (cómo te sentiste, ajustes de agarre...)',
                      hintStyle: const TextStyle(color: FulcroColors.muted, fontSize: 13),
                      filled: true,
                      fillColor: FulcroColors.glass,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    ),
                  ),
                ]),
              ),
              const SizedBox(height: 18),
              GradientButton(label: widget.isNew ? 'Guardar serie' : 'Guardar cambios', onPressed: _saving ? () {} : () => _save(app)),
              if (hasVideo) ...[
                const SizedBox(height: 10),
                GradientButton(
                  label: 'Ver en cámara lenta',
                  ghost: true,
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReplayScreen(record: r))),
                ),
              ],
              const SizedBox(height: 10),
              GradientButton(
                label: widget.isNew ? 'Descartar' : 'Eliminar serie',
                ghost: true,
                onPressed: () async {
                  if (!widget.isNew) await app.deleteSet(r);
                  if (context.mounted) Navigator.pop(context, false);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TipCard extends StatelessWidget {
  const _TipCard(this.tip);
  final Tip tip;

  @override
  Widget build(BuildContext context) {
    final (color, icon) = switch (tip.level) {
      TipLevel.good => (FulcroColors.teal, Icons.check_rounded),
      TipLevel.warn => (FulcroColors.warn, Icons.priority_high_rounded),
      TipLevel.info => (FulcroColors.muted, Icons.info_outline_rounded),
    };
    return Glass(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(color: FulcroColors.glassStrong, borderRadius: BorderRadius.circular(12), border: Border.all(color: FulcroColors.edge)),
          child: Icon(icon, size: 18, color: color),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(tip.title, style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(tip.text, style: const TextStyle(color: FulcroColors.muted, fontSize: 13)),
          ]),
        ),
      ]),
    );
  }
}
