import 'dart:io';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../analysis/pose_overlay.dart';
import '../data/app_state.dart';
import '../data/exercises.dart';
import '../data/models.dart';
import '../theme/app_theme.dart';
import '../widgets/glass.dart';

/// Replays the recorded video in slow motion with the skeleton on top.
/// Shows the fatigue point and lets the user mark moments where the technique breaks.
class ReplayScreen extends StatefulWidget {
  const ReplayScreen({super.key, required this.record});
  final SetRecord record;

  @override
  State<ReplayScreen> createState() => _ReplayScreenState();
}

class _ReplayScreenState extends State<ReplayScreen> {
  VideoPlayerController? _video;
  List<PoseFrame> _frames = [];
  String? _error;
  double _speed = 0.5;
  bool _skeleton = true;
  Duration _pos = Duration.zero;

  SetRecord get r => widget.record;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final path = r.videoPath;
    if (path == null || !File(path).existsSync()) {
      setState(() => _error = 'No hay vídeo guardado para esta serie.');
      return;
    }
    final app = AppScope.of(context);
    final frames = await app.loadFrames(r.id);
    final c = VideoPlayerController.file(File(path));
    try {
      await c.initialize();
      await c.setLooping(true);
      await c.setPlaybackSpeed(_speed);
      c.addListener(() {
        if (mounted) setState(() => _pos = c.value.position);
      });
      if (!mounted) {
        await c.dispose();
        return;
      }
      setState(() {
        _video = c;
        _frames = frames;
      });
      await c.play();
    } catch (e) {
      if (mounted) setState(() => _error = 'No se pudo reproducir el vídeo.');
    }
  }

  @override
  void dispose() {
    _video?.dispose();
    super.dispose();
  }

  /// Frame closest to the current position, if one is within a quarter second.
  PoseFrame? _frameAt(int ms) {
    if (_frames.isEmpty) return null;
    var lo = 0, hi = _frames.length - 1;
    while (lo < hi) {
      final mid = (lo + hi) ~/ 2;
      if (_frames[mid].t < ms) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    var best = _frames[lo];
    if (lo > 0 && (ms - _frames[lo - 1].t).abs() < (best.t - ms).abs()) best = _frames[lo - 1];
    return (best.t - ms).abs() <= 250 ? best : null;
  }

  String _fmt(int ms) {
    final s = ms / 1000;
    return '${(s ~/ 60)}:${(s % 60).toStringAsFixed(1).padLeft(4, '0')}';
  }

  Future<void> _seek(int ms) async {
    final v = _video;
    if (v == null) return;
    await v.seekTo(Duration(milliseconds: ms.clamp(0, v.value.duration.inMilliseconds)));
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final ex = exerciseById(r.exerciseId);
    final v = _video;
    final frame = _frameAt(_pos.inMilliseconds);
    final fatigueMs = r.fatigueRep == null || r.fatigueRep! > r.reps.length ? null : r.reps[r.fatigueRep! - 1].startMs;
    final total = v?.value.duration.inMilliseconds ?? 1;

    return Scaffold(
      body: AmbientBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 40),
            children: [
              Row(children: [
                IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.arrow_back_rounded)),
                Expanded(child: Text(ex.name, style: displayStyle(size: 18, weight: FontWeight.w500))),
              ]),
              const SizedBox(height: 8),
              if (_error != null)
                Glass(child: Text(_error!, style: const TextStyle(color: FulcroColors.muted)))
              else if (v == null)
                const SizedBox(height: 300, child: Center(child: CircularProgressIndicator(color: FulcroColors.copper)))
              else ...[
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 320),
                    child: AspectRatio(
                      aspectRatio: v.value.aspectRatio,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(22),
                        child: Stack(fit: StackFit.expand, children: [
                          VideoPlayer(v),
                          if (_skeleton)
                            CustomPaint(painter: ArmPainter(p: frame?.p, joint: ex.joint, angle: frame?.angle)),
                        ]),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                _Timeline(
                  totalMs: total,
                  posMs: _pos.inMilliseconds.clamp(0, total),
                  marks: r.marks,
                  fatigueMs: fatigueMs,
                  reps: r.reps,
                  onSeek: _seek,
                ),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text(_fmt(_pos.inMilliseconds), style: const TextStyle(color: FulcroColors.muted, fontSize: 12)),
                  Text(_fmt(total), style: const TextStyle(color: FulcroColors.muted, fontSize: 12)),
                ]),
                const SizedBox(height: 8),
                Row(children: [
                  IconButton.filledTonal(onPressed: () => _seek(_pos.inMilliseconds - 500), icon: const Icon(Icons.replay_rounded)),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: () => v.value.isPlaying ? v.pause() : v.play(),
                    icon: Icon(v.value.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded),
                    style: IconButton.styleFrom(backgroundColor: FulcroColors.copper, foregroundColor: const Color(0xFF1A0D05)),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filledTonal(onPressed: () => _seek(_pos.inMilliseconds + 500), icon: const Icon(Icons.fast_forward_rounded)),
                  const Spacer(),
                  Switch(value: _skeleton, onChanged: (x) => setState(() => _skeleton = x)),
                  const Text('Esqueleto', style: TextStyle(fontSize: 12, color: FulcroColors.muted)),
                ]),
                const SizedBox(height: 10),
                Segmented<double>(
                  options: const [0.25, 0.5, 1.0],
                  value: _speed,
                  onChanged: (s) {
                    setState(() => _speed = s);
                    v.setPlaybackSpeed(s);
                  },
                  label: (s) => '${s}x',
                ),
                const SizedBox(height: 14),
                GradientButton(
                  label: 'Marcar este momento',
                  onPressed: () async {
                    final ms = _pos.inMilliseconds;
                    if (r.marks.any((m) => (m - ms).abs() < 300)) return;
                    setState(() => r.marks = [...r.marks, ms]..sort());
                    await app.updateSet(r);
                  },
                ),
                const SizedBox(height: 14),
                if (fatigueMs != null)
                  _MomentTile(
                    color: FulcroColors.warn,
                    title: 'Fatiga · repetición ${r.fatigueRep}',
                    time: _fmt(fatigueMs),
                    onTap: () => _seek(fatigueMs),
                  ),
                for (final (i, m) in r.marks.indexed)
                  _MomentTile(
                    color: FulcroColors.teal,
                    title: 'Marca ${i + 1}',
                    time: _fmt(m),
                    onTap: () => _seek(m),
                    onDelete: () async {
                      setState(() => r.marks = [...r.marks]..removeAt(i));
                      await app.updateSet(r);
                    },
                  ),
                const SizedBox(height: 8),
                const Text(
                  'El esqueleto sale de los datos guardados al grabar. Si no coincide con el vídeo, desactívalo con el interruptor.',
                  style: TextStyle(color: FulcroColors.muted, fontSize: 12),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({
    required this.totalMs,
    required this.posMs,
    required this.marks,
    required this.fatigueMs,
    required this.reps,
    required this.onSeek,
  });

  final int totalMs;
  final int posMs;
  final List<int> marks;
  final int? fatigueMs;
  final List<RepData> reps;
  final ValueChanged<int> onSeek;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      double x(int ms) => totalMs == 0 ? 0 : ms / totalMs * c.maxWidth;
      void seekAt(double dx) => onSeek((dx / c.maxWidth * totalMs).round().clamp(0, totalMs));
      return GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (d) => seekAt(d.localPosition.dx),
        onHorizontalDragUpdate: (d) => seekAt(d.localPosition.dx),
        child: SizedBox(
          height: 34,
          child: Stack(clipBehavior: Clip.none, children: [
            Positioned(
              left: 0,
              right: 0,
              top: 14,
              child: Container(height: 6, decoration: BoxDecoration(color: FulcroColors.glassStrong, borderRadius: BorderRadius.circular(3))),
            ),
            Positioned(
              left: 0,
              top: 14,
              child: Container(
                width: x(posMs),
                height: 6,
                decoration: BoxDecoration(gradient: FulcroColors.accentGradient, borderRadius: BorderRadius.circular(3)),
              ),
            ),
            for (final rep in reps)
              Positioned(left: x(rep.startMs), top: 10, child: Container(width: 1.5, height: 14, color: Colors.white24)),
            if (fatigueMs != null) Positioned(left: x(fatigueMs!) - 1.5, top: 6, child: Container(width: 3, height: 22, color: FulcroColors.warn)),
            for (final m in marks) Positioned(left: x(m) - 1.5, top: 6, child: Container(width: 3, height: 22, color: FulcroColors.teal)),
            Positioned(left: x(posMs) - 7, top: 10, child: Container(width: 14, height: 14, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle))),
          ]),
        ),
      );
    });
  }
}

class _MomentTile extends StatelessWidget {
  const _MomentTile({required this.color, required this.title, required this.time, required this.onTap, this.onDelete});

  final Color color;
  final String title;
  final String time;
  final VoidCallback onTap;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Glass(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          radius: 16,
          child: Row(children: [
            Container(width: 4, height: 24, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
            const SizedBox(width: 12),
            Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600))),
            Text(time, style: const TextStyle(color: FulcroColors.muted, fontSize: 13)),
            if (onDelete != null) IconButton(onPressed: onDelete, icon: const Icon(Icons.close_rounded, size: 18)),
          ]),
        ),
      ),
    );
  }
}
