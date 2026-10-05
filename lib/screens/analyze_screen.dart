import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';

import '../analysis/angle.dart';
import '../analysis/pose_overlay.dart';
import '../analysis/pose_reader.dart';
import '../analysis/set_summary.dart';
import '../data/app_state.dart';
import '../data/exercises.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/glass.dart';
import 'report_screen.dart';

/// Live camera + on-device pose detection for the chosen exercise and arm.
/// While idle it only checks light and framing; while recording it also builds
/// repetitions, stores pose frames and records the video.
class AnalyzeScreen extends StatefulWidget {
  const AnalyzeScreen({super.key});

  @override
  State<AnalyzeScreen> createState() => _AnalyzeScreenState();
}

class _AnalyzeScreenState extends State<AnalyzeScreen> {
  CameraController? _camera;
  final _detector = PoseDetector(options: PoseDetectorOptions(mode: PoseDetectionMode.stream));

  String? _error;
  bool _recording = false;
  bool _withVideo = false;
  bool _busy = false;
  bool _disposed = false;

  RepTracker? _tracker;
  final List<PoseFrame> _frames = [];
  final Stopwatch _clock = Stopwatch();
  DateTime _startedAt = DateTime.now();

  ArmReading? _reading;
  double _luma = 128;
  int _reps = 0;
  int _lastRepMs = 0;
  int _frameCount = 0;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        setState(() => _error = 'Este dispositivo no tiene cámara.');
        return;
      }
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        back,
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.nv21,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _camera = controller);
      await _startStatusStream();
    } on CameraException catch (e) {
      if (mounted) {
        setState(() => _error = e.code == 'CameraAccessDenied'
            ? 'Fulcro necesita permiso de cámara. Actívalo en Ajustes > Apps > Fulcro.'
            : 'No se pudo abrir la cámara (${e.code}).');
      }
    }
  }

  Future<void> _startStatusStream() async {
    final cam = _camera;
    if (cam == null || _disposed || cam.value.isStreamingImages) return;
    await cam.startImageStream(_onFrame);
  }

  // --- recording -----------------------------------------------------------
  Future<void> _start(AppState app) async {
    final cam = _camera;
    if (cam == null) return;
    final ex = app.exercise;
    _tracker = RepTracker(openAbove: ex.openAbove, closedBelow: ex.closedBelow);
    _frames.clear();
    _reps = 0;
    _lastRepMs = 0;
    _frameCount = 0;
    _startedAt = DateTime.now();

    if (cam.value.isStreamingImages) await cam.stopImageStream();
    try {
      await cam.startVideoRecording(onAvailable: _onFrame);
      _withVideo = true;
    } catch (e) {
      // Some devices cannot stream frames while recording video: analyse without video.
      _withVideo = false;
      await _startStatusStream();
    }
    _clock
      ..reset()
      ..start();
    setState(() => _recording = true);
  }

  Future<void> _stop(AppState app) async {
    final cam = _camera;
    if (cam == null) return;
    _clock.stop();
    setState(() => _recording = false);

    String? videoPath;
    if (_withVideo) {
      try {
        videoPath = (await cam.stopVideoRecording()).path;
      } catch (_) {}
      await _startStatusStream();
    }

    final tracker = _tracker;
    final reps = tracker == null ? <RepData>[] : List<RepData>.of(tracker.reps);
    final record = SetRecord(
      id: _startedAt.microsecondsSinceEpoch.toString(),
      exerciseId: app.exercise.id,
      arm: app.arm,
      weightKg: app.weightKg,
      startedAt: _startedAt,
      durationMs: _clock.elapsedMilliseconds,
      reps: reps,
      fatigueRep: detectFatigue(reps),
    );
    if (!mounted) return;
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ReportScreen(
          record: record,
          isNew: true,
          frames: List<PoseFrame>.of(_frames),
          tempVideoPath: videoPath,
        ),
      ),
    );
    if (saved == true && mounted) app.startRest();
  }

  // --- frames --------------------------------------------------------------
  Future<void> _onFrame(CameraImage image) async {
    if (_busy || _disposed) return;
    _busy = true;
    try {
      final input = _toInputImage(image);
      if (input == null) return;
      final poses = await _detector.processImage(input);
      if (!mounted) return;
      final app = AppScope.of(context);
      final rotated = _camera!.description.sensorOrientation % 180 == 90;
      final upright = rotated
          ? Size(image.height.toDouble(), image.width.toDouble())
          : Size(image.width.toDouble(), image.height.toDouble());
      final reading = poses.isEmpty ? null : readArm(poses.first, app.arm, upright);

      if (_recording && reading != null && _tracker != null) {
        final t = _clock.elapsedMilliseconds;
        final ex = app.exercise;
        final tracked = ex.joint == Joint.elbow ? reading.elbowAngle : reading.wristAngle;
        final before = _tracker!.reps.length;
        _tracker!.add(t, tracked, wrist: reading.wristAngle);
        _frames.add(PoseFrame(t, reading.p, tracked));
        if (_tracker!.reps.length > before) {
          _reps = _tracker!.reps.length;
          _lastRepMs = _tracker!.reps.last.durationMs;
        }
      }

      // Light is sampled every few frames; it only needs to be roughly right.
      if (++_frameCount % 5 == 0) _luma = _meanLuma(image);
      setState(() => _reading = reading);
    } catch (_) {
      // A dropped frame is harmless.
    } finally {
      _busy = false;
    }
  }

  double _meanLuma(CameraImage image) {
    final y = image.planes.first.bytes;
    var sum = 0, n = 0;
    for (var i = 0; i < y.length; i += 97) {
      sum += y[i];
      n++;
    }
    return n == 0 ? 128 : sum / n;
  }

  InputImage? _toInputImage(CameraImage image) {
    final cam = _camera;
    if (cam == null) return null;
    final rotation = InputImageRotationValue.fromRawValue(cam.description.sensorOrientation);
    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (rotation == null || format == null || format != InputImageFormat.nv21 || image.planes.length != 1) {
      return null;
    }
    final plane = image.planes.first;
    return InputImage.fromBytes(
      bytes: plane.bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
  }

  @override
  void dispose() {
    _disposed = true;
    final cam = _camera;
    if (cam != null) {
      if (cam.value.isRecordingVideo) cam.stopVideoRecording().catchError((_) => XFile(''));
      if (cam.value.isStreamingImages) cam.stopImageStream();
      cam.dispose();
    }
    _detector.close();
    super.dispose();
  }

  // --- UI ------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final ex = app.exercise;
    final done = app.setsToday(ex.id);
    final tracked = _reading == null ? null : (ex.joint == Joint.elbow ? _reading!.elbowAngle : _reading!.wristAngle);
    final lightOk = _luma >= 55;
    final armOk = _reading != null && _reading!.inFrame;
    final ready = lightOk && armOk;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 120),
      children: [
        Eyebrow('Serie ${done + 1} de ${ex.defaultSets} · hoy'),
        const SizedBox(height: 2),
        InkWell(
          onTap: _recording ? null : () => _pickExercise(app),
          borderRadius: BorderRadius.circular(12),
          child: Row(children: [
            Flexible(child: Text(ex.name, style: displayStyle(size: 22, weight: FontWeight.w500), overflow: TextOverflow.ellipsis)),
            if (!_recording) const Padding(padding: EdgeInsets.only(left: 6), child: Icon(Icons.expand_more_rounded, color: FulcroColors.muted)),
          ]),
        ),
        const SizedBox(height: 4),
        Text('Mide: ${ex.jointLabel.toLowerCase()} · ${ex.focus}', style: const TextStyle(color: FulcroColors.muted, fontSize: 13)),
        const SizedBox(height: 14),
        if (!_recording) ...[
          Segmented<Arm>(options: Arm.values, value: app.arm, onChanged: app.pickArm, label: (a) => 'Brazo ${a.label.toLowerCase()}'),
          const SizedBox(height: 10),
          _WeightRow(app: app),
          const SizedBox(height: 10),
          Row(children: [
            const Text('Descanso', style: TextStyle(color: FulcroColors.muted, fontSize: 13)),
            const SizedBox(width: 12),
            Expanded(
              child: Segmented<int>(
                options: const [60, 90, 120, 180],
                value: app.restSeconds,
                onChanged: app.setRestSeconds,
                label: (s) => s % 60 == 0 ? '${s ~/ 60} min' : '${s ~/ 60}:${s % 60}',
              ),
            ),
          ]),
          const SizedBox(height: 14),
        ],
        if (app.restLeft != null) ...[_RestCard(app: app), const SizedBox(height: 14)],
        _preview(app, tracked, ready),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          Pill(lightOk ? 'Luz buena' : 'Luz baja', color: lightOk ? FulcroColors.teal : FulcroColors.warn),
          Pill(
            _reading == null ? 'Buscando brazo' : (armOk ? 'Brazo visible' : 'Brazo fuera de cuadro'),
            color: armOk ? FulcroColors.teal : FulcroColors.warn,
          ),
          if (ready && !_recording) const Pill('Listo para grabar', color: FulcroColors.teal),
        ]),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: MetricCard(label: ex.jointLabel, value: tracked == null ? '--' : '${tracked.round()}°')),
          const SizedBox(width: 12),
          Expanded(child: MetricCard(label: 'Repeticiones', value: '$_reps')),
          const SizedBox(width: 12),
          Expanded(child: MetricCard(label: 'Última rep', value: _lastRepMs == 0 ? '--' : '${(_lastRepMs / 1000).toStringAsFixed(1)}s')),
        ]),
        const SizedBox(height: 14),
        Glass(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(ex.camera, style: const TextStyle(color: FulcroColors.muted, fontSize: 13)),
            if (ex.precision != 'Alta') ...[
              const SizedBox(height: 6),
              Text('Precisión: ${ex.precision}', style: const TextStyle(color: FulcroColors.amber, fontSize: 12)),
            ],
          ]),
        ),
        const SizedBox(height: 14),
        GradientButton(
          label: _recording ? 'Detener y ver informe' : 'Grabar serie',
          ghost: _recording,
          onPressed: _camera == null ? () {} : () => _recording ? _stop(app) : _start(app),
        ),
      ],
    );
  }

  Widget _preview(AppState app, double? tracked, bool ready) {
    final cam = _camera;
    final radius = BorderRadius.circular(22);
    Widget content;
    var aspect = 3 / 4;
    if (_error != null) {
      content = Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: FulcroColors.muted)),
        ),
      );
    } else if (cam == null || !cam.value.isInitialized) {
      content = const Center(child: CircularProgressIndicator(color: FulcroColors.copper));
    } else {
      final ps = cam.value.previewSize!;
      aspect = ps.height / ps.width; // portrait
      content = Stack(fit: StackFit.expand, children: [
        CameraPreview(cam),
        CustomPaint(painter: GuidePainter(ok: ready, showArm: _reading == null)),
        CustomPaint(painter: ArmPainter(p: _reading?.p, joint: app.exercise.joint, angle: tracked)),
        Positioned(
          top: 12,
          left: 12,
          child: Pill(
            _recording ? 'Grabando${_withVideo ? '' : ' (sin vídeo)'}' : 'Vista previa',
            color: _recording ? const Color(0xFFFF5A5A) : FulcroColors.text,
          ),
        ),
      ]);
    }
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 300),
        child: AspectRatio(
          aspectRatio: aspect,
          child: ClipRRect(
            borderRadius: radius,
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFF0A0D14),
                border: Border.all(color: FulcroColors.edge),
                borderRadius: radius,
              ),
              child: content,
            ),
          ),
        ),
      ),
    );
  }

  void _pickExercise(AppState app) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: FulcroColors.panel,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: .8,
        maxChildSize: .95,
        builder: (ctx, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 30),
          children: [
            Text('Ejercicio', style: displayStyle(size: 20, weight: FontWeight.w500)),
            const SizedBox(height: 12),
            for (final e in exercises) ...[
              GestureDetector(
                onTap: () {
                  app.pickExercise(e);
                  setState(() {
                    _reps = 0;
                    _lastRepMs = 0;
                  });
                  Navigator.pop(ctx);
                },
                child: Glass(
                  borderColor: e.id == app.exercise.id ? FulcroColors.teal.withValues(alpha: .6) : null,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(e.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                      Pill(e.jointLabel),
                    ]),
                    const SizedBox(height: 2),
                    Text(e.focus, style: const TextStyle(color: FulcroColors.muted, fontSize: 13)),
                    const SizedBox(height: 8),
                    for (final c in e.cues) Text('· $c', style: const TextStyle(fontSize: 13)),
                    const SizedBox(height: 8),
                    Text(
                      'Objetivo: ${e.minRange.round()}° de rango · ${(e.tempoMinMs / 1000).toStringAsFixed(1)} a ${(e.tempoMaxMs / 1000).toStringAsFixed(1)} s por rep',
                      style: const TextStyle(color: FulcroColors.muted, fontSize: 12),
                    ),
                    if (e.precision != 'Alta')
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text('Precisión: ${e.precision}', style: const TextStyle(color: FulcroColors.amber, fontSize: 12)),
                      ),
                  ]),
                ),
              ),
              const SizedBox(height: 10),
            ],
          ],
        ),
      ),
    );
  }
}

class _WeightRow extends StatelessWidget {
  const _WeightRow({required this.app});
  final AppState app;

  @override
  Widget build(BuildContext context) {
    return Glass(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      radius: 16,
      child: Row(children: [
        const SizedBox(width: 8),
        const Expanded(child: Text('Peso o resistencia', style: TextStyle(color: FulcroColors.muted, fontSize: 13))),
        IconButton(onPressed: () => app.setWeight(app.weightKg - 2.5), icon: const Icon(Icons.remove_rounded)),
        SizedBox(
          width: 64,
          child: Text(
            '${app.weightKg % 1 == 0 ? app.weightKg.toInt() : app.weightKg} kg',
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        IconButton(onPressed: () => app.setWeight(app.weightKg + 2.5), icon: const Icon(Icons.add_rounded)),
      ]),
    );
  }
}

class _RestCard extends StatelessWidget {
  const _RestCard({required this.app});
  final AppState app;

  @override
  Widget build(BuildContext context) {
    final left = app.restLeft ?? 0;
    final mm = (left ~/ 60).toString();
    final ss = (left % 60).toString().padLeft(2, '0');
    return Glass(
      borderColor: FulcroColors.copper.withValues(alpha: .6),
      child: Column(children: [
        const Eyebrow('Descanso'),
        const SizedBox(height: 4),
        Text('$mm:$ss', style: displayStyle(size: 40)),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: GradientButton(label: '+30 s', ghost: true, onPressed: () => app.addRest(30))),
          const SizedBox(width: 10),
          Expanded(child: GradientButton(label: 'Saltar', onPressed: app.cancelRest)),
        ]),
      ]),
    );
  }
}
