import '../data/exercises.dart';
import '../data/models.dart';

enum TipLevel { good, warn, info }

class Tip {
  const Tip(this.level, this.title, this.text);
  final TipLevel level;
  final String title;
  final String text;
}

class SetSummary {
  const SetSummary({
    required this.reps,
    required this.avgRange,
    required this.avgMin,
    required this.avgMax,
    required this.avgTempoMs,
    required this.rangeVariation,
    required this.fatigueRep,
    required this.tips,
  });

  final int reps;
  final double avgRange;
  final double avgMin;
  final double avgMax;
  final double avgTempoMs;
  final double rangeVariation; // coefficient of variation of the range, 0..1
  final int? fatigueRep; // 1-based
  final List<Tip> tips;
}

/// First rep (1-based) where range falls 15% or tempo slows 25% against the
/// first three reps. Needs at least 5 reps to say anything.
int? detectFatigue(List<RepData> reps) {
  if (reps.length < 5) return null;
  final base = reps.take(3).toList();
  final baseRange = mean(base.map((r) => r.range));
  final baseTempo = mean(base.map((r) => r.durationMs.toDouble()));
  for (var i = 3; i < reps.length; i++) {
    final r = reps[i];
    if (r.range < baseRange * 0.85 || r.durationMs > baseTempo * 1.25) return i + 1;
  }
  return null;
}

SetSummary summarize(List<RepData> reps, Exercise ex) {
  final ranges = reps.map((r) => r.range).toList();
  final avgRange = mean(ranges);
  final tempo = mean(reps.map((r) => r.durationMs.toDouble()));
  final variation = avgRange == 0 ? 0.0 : stdDev(ranges) / avgRange;
  final fatigue = detectFatigue(reps);

  final tips = <Tip>[];
  if (reps.length < 3) {
    tips.add(const Tip(TipLevel.info, 'Pocas repeticiones',
        'Con menos de 3 repeticiones válidas no se puede analizar la serie. Revisa la posición de la cámara.'));
  } else {
    if (avgRange < ex.minRange) {
      tips.add(Tip(TipLevel.warn, 'Rango corto',
          'Tu rango medio fue ${avgRange.round()}° y el objetivo es ${ex.minRange.round()}° o más. Baja el peso y completa el movimiento.'));
    } else {
      tips.add(Tip(TipLevel.good, 'Rango completo',
          'Rango medio de ${avgRange.round()}°, por encima del objetivo de ${ex.minRange.round()}°.'));
    }
    if (tempo < ex.tempoMinMs) {
      tips.add(Tip(TipLevel.warn, 'Demasiado rápido',
          'Cada repetición duró ${(tempo / 1000).toStringAsFixed(1)} s. Apunta a ${(ex.tempoMinMs / 1000).toStringAsFixed(1)} s o más y controla la bajada.'));
    } else if (tempo > ex.tempoMaxMs) {
      tips.add(Tip(TipLevel.info, 'Tempo lento',
          'Cada repetición duró ${(tempo / 1000).toStringAsFixed(1)} s. Está bien para trabajo isométrico; si no era la idea, acelera un poco.'));
    } else {
      tips.add(Tip(TipLevel.good, 'Tempo controlado',
          '${(tempo / 1000).toStringAsFixed(1)} s por repetición, dentro del rango de ${(ex.tempoMinMs / 1000).toStringAsFixed(1)} a ${(ex.tempoMaxMs / 1000).toStringAsFixed(1)} s.'));
    }
    if (variation > 0.15) {
      tips.add(const Tip(TipLevel.warn, 'Rango irregular',
          'El rango cambia mucho entre repeticiones. Busca repetir siempre el mismo recorrido.'));
    }
    if (fatigue != null) {
      tips.add(Tip(TipLevel.warn, 'Fatiga desde la repetición $fatigue',
          'Desde ahí el rango baja o el tempo se alarga. Considera cortar la serie ahí o bajar el peso.'));
    }
  }

  return SetSummary(
    reps: reps.length,
    avgRange: avgRange,
    avgMin: mean(reps.map((r) => r.minAngle)),
    avgMax: mean(reps.map((r) => r.maxAngle)),
    avgTempoMs: tempo,
    rangeVariation: variation,
    fatigueRep: fatigue,
    tips: tips,
  );
}
