import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';
import '../analysis/angle.dart';
import '../analysis/pose_overlay.dart';
import '../theme/app_theme.dart';
import '../widgets/glass.dart';

/// Live camera + on-device pose detection. Measures the elbow angle and counts reps.
/// Assumes the phone is held in portrait on the side of the table.
class AnalyzeScreen extends StatefulWidget {
  const AnalyzeScreen({super.key});

  @override
  State<AnalyzeScreen> createState() => _AnalyzeScreenState();
}

class _AnalyzeScreenState extends State<AnalyzeScreen> {
  CameraController? _camera;
  final _detector = PoseDetector(options: PoseDetectorOptions(mode: PoseDetectionMode.stream));
  final _reps = RepCounter();

  String? _error;
  bool _recording = false;
  bool _busy = false;
  Pose? _pose;
  Size _imageSize = const Size(1, 1);
  ArmSide _side = ArmSide.right;
  double? _angle;

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
    } on CameraException catch (e) {
      setState(() => _error = e.code == 'CameraAccessDenied'
          ? 'Fulcro necesita permiso de cámara. Actívalo en Ajustes > Apps > Fulcro.'
          : 'No se pudo abrir la cámara (${e.code}).');
    }
  }

  Future<void> _toggle() async {
    final cam = _camera;
    if (cam == null) return;
    if (_recording) {
      await cam.stopImageStream();
      setState(() => _recording = false);
    } else {
      _reps.reset();
      setState(() {
        _recording = true;
        _angle = null;
        _pose = null;
      });
      await cam.startImageStream(_onFrame);
    }
  }

  Future<void> _onFrame(CameraImage image) async {
    if (_busy) return; // drop frames while the detector is working
    _busy = true;
    try {
      final input = _toInputImage(image);
      if (input == null) return;
      final poses = await _detector.processImage(input);
      if (!mounted || poses.isEmpty) {
        if (mounted) setState(() => _pose = null);
        return;
      }
      final pose = poses.first;
      final side = _pickSide(pose);
      final s = pose.landmarks[side.shoulder]!, e = pose.landmarks[side.elbow]!, w = pose.landmarks[side.wrist]!;
      final angle = jointAngle((x: s.x, y: s.y), (x: e.x, y: e.y), (x: w.x, y: w.y));
      _reps.add(angle);
      setState(() {
        _pose = pose;
        _side = side;
        _angle = angle;
        // Rotated 90°: image width/height swap in portrait.
        _imageSize = Size(image.height.toDouble(), image.width.toDouble());
      });
    } finally {
      _busy = false;
    }
  }

  ArmSide _pickSide(Pose pose) {
    double score(ArmSide a) =>
        (pose.landmarks[a.shoulder]?.likelihood ?? 0) +
        (pose.landmarks[a.elbow]?.likelihood ?? 0) +
        (pose.landmarks[a.wrist]?.likelihood ?? 0);
    return score(ArmSide.right) >= score(ArmSide.left) ? ArmSide.right : ArmSide.left;
  }

  InputImage? _toInputImage(CameraImage image) {
    final cam = _camera;
    if (cam == null) return null;
    final rotation = InputImageRotationValue.fromRawValue(cam.description.sensorOrientation);
    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (rotation == null || format == null || format != InputImageFormat.nv21 || image.planes.length != 1) return null;
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
    final cam = _camera;
    if (cam != null && cam.value.isStreamingImages) cam.stopImageStream();
    cam?.dispose();
    _detector.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 120),
      children: [
        Text('PRESS LATERAL', style: _eyebrow),
        const SizedBox(height: 2),
        Text('Análisis', style: displayStyle(size: 22, weight: FontWeight.w500)),
        const SizedBox(height: 14),
        _preview(),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: _metric('Codo', _angle == null ? '--' : '${_angle!.round()}°')),
          const SizedBox(width: 12),
          Expanded(child: _metric('Repeticiones', '${_reps.reps}')),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: _metric('Rango', _reps.range == 0 ? '--' : '${_reps.range.round()}°')),
          const SizedBox(width: 12),
          Expanded(child: _metric('Brazo', _side == ArmSide.right ? 'Derecho' : 'Izquierdo')),
        ]),
        const SizedBox(height: 14),
        const Glass(
          child: Text(
            'Coloca el móvil de lado, a la altura de la mesa, con el brazo completo a la vista.',
            style: TextStyle(color: FulcroColors.muted, fontSize: 13),
          ),
        ),
        const SizedBox(height: 14),
        GradientButton(
          label: _recording ? 'Detener' : 'Grabar serie',
          ghost: _recording,
          onPressed: _camera == null ? () {} : _toggle,
        ),
      ],
    );
  }

  Widget _preview() {
    final cam = _camera;
    final radius = BorderRadius.circular(22);
    Widget content;
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
      content = Stack(fit: StackFit.expand, children: [
        FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(
            width: cam.value.previewSize!.height,
            height: cam.value.previewSize!.width,
            child: CameraPreview(cam),
          ),
        ),
        CustomPaint(painter: PoseOverlay(pose: _pose, imageSize: _imageSize, side: _side, angle: _angle)),
        Positioned(
          top: 12,
          left: 12,
          child: Pill(_recording ? 'Grabando' : 'Listo', color: _recording ? const Color(0xFFFF5A5A) : FulcroColors.text),
        ),
      ]);
    }
    return ClipRRect(
      borderRadius: radius,
      child: Container(
        height: 360,
        decoration: BoxDecoration(
          color: const Color(0xFF0A0D14),
          border: Border.all(color: FulcroColors.edge),
          borderRadius: radius,
        ),
        child: content,
      ),
    );
  }

  Widget _metric(String label, String value) => Glass(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(color: FulcroColors.muted, fontSize: 12)),
          const SizedBox(height: 4),
          FittedBox(fit: BoxFit.scaleDown, child: Text(value, style: displayStyle(size: 24))),
        ]),
      );
}

const _eyebrow = TextStyle(fontSize: 11, letterSpacing: 1.4, color: FulcroColors.muted);
