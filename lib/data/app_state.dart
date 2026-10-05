import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../analysis/set_summary.dart';
import '../services/cloud.dart';
import '../services/reminders.dart';
import 'exercises.dart';
import 'models.dart';

/// Everything the screens share: saved sets, weekly plan and the workout in progress.
class AppState extends ChangeNotifier {
  AppState(this._prefs, {Directory? docs, CloudService? cloud})
      : _docs = docs, // ignore: prefer_initializing_formals
        cloud = cloud ?? CloudService() {
    final raw = _prefs.getString(_kSets);
    if (raw != null) {
      try {
        sets = (jsonDecode(raw) as List)
            .map((e) => SetRecord.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList()
          ..sort((a, b) => b.startedAt.compareTo(a.startedAt));
      } catch (e) {
        debugPrint('Fulcro: no se pudo leer el historial ($e)');
      }
    }
    final p = _prefs.getString(_kPlan);
    if (p != null) {
      try {
        plan = Plan.fromJson(Map<String, dynamic>.from(jsonDecode(p) as Map));
      } catch (_) {}
    }
  }

  static const _kSets = 'sets_v1';
  static const _kPlan = 'plan_v1';

  final SharedPreferences _prefs;
  final Directory? _docs;
  final CloudService cloud;

  List<SetRecord> sets = [];
  Plan plan = const Plan();

  // --- workout in progress -------------------------------------------------
  Exercise exercise = exercises.first;
  Arm arm = Arm.right;
  double weightKg = 20;
  int restSeconds = 90;
  int? restLeft;
  Timer? _restTimer;

  static Future<AppState> load() async {
    final prefs = await SharedPreferences.getInstance();
    Directory? docs;
    try {
      docs = await getApplicationDocumentsDirectory();
    } catch (_) {}
    return AppState(prefs, docs: docs);
  }

  void pickExercise(Exercise e) {
    exercise = e;
    notifyListeners();
  }

  void pickArm(Arm a) {
    arm = a;
    notifyListeners();
  }

  void setWeight(double kg) {
    weightKg = kg.clamp(0, 500).toDouble();
    notifyListeners();
  }

  void setRestSeconds(int s) {
    restSeconds = s;
    notifyListeners();
  }

  int setsToday(String exerciseId) {
    final now = DateTime.now();
    return sets
        .where((s) =>
            s.exerciseId == exerciseId &&
            s.startedAt.year == now.year &&
            s.startedAt.month == now.month &&
            s.startedAt.day == now.day)
        .length;
  }

  void startRest() {
    _restTimer?.cancel();
    restLeft = restSeconds;
    _restTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      restLeft = (restLeft ?? 1) - 1;
      if (restLeft! <= 0) {
        t.cancel();
        restLeft = null;
        SystemSound.play(SystemSoundType.alert);
        HapticFeedback.heavyImpact();
      }
      notifyListeners();
    });
    notifyListeners();
  }

  void addRest(int seconds) {
    if (restLeft != null) {
      restLeft = restLeft! + seconds;
      notifyListeners();
    }
  }

  void cancelRest() {
    _restTimer?.cancel();
    restLeft = null;
    notifyListeners();
  }

  // --- history -------------------------------------------------------------
  Future<void> _persistSets() => _prefs.setString(_kSets, jsonEncode(sets.map((s) => s.toJson()).toList()));

  File? _frameFile(String id) => _docs == null ? null : File('${_docs.path}/frames/$id.json');

  /// Saves a set, its pose frames and (if any) moves the recorded video into app storage.
  Future<void> addSet(SetRecord s, {List<PoseFrame> frames = const [], String? tempVideoPath}) async {
    if (_docs != null) {
      try {
        if (frames.isNotEmpty) {
          final f = _frameFile(s.id)!;
          await f.parent.create(recursive: true);
          await f.writeAsString(jsonEncode(frames.map((e) => e.toJson()).toList()));
        }
        if (tempVideoPath != null && File(tempVideoPath).existsSync()) {
          final dir = Directory('${_docs.path}/videos');
          await dir.create(recursive: true);
          final dest = '${dir.path}/${s.id}.mp4';
          await File(tempVideoPath).copy(dest);
          s.videoPath = dest;
        }
      } catch (e) {
        debugPrint('Fulcro: no se pudo guardar el vídeo ($e)');
      }
    }
    sets.insert(0, s);
    sets.sort((a, b) => b.startedAt.compareTo(a.startedAt));
    await _persistSets();
    notifyListeners();
    unawaited(cloud.pushSet(s, avgRange: s.avgRange, avgTempoMs: s.avgTempoMs));
  }

  Future<List<PoseFrame>> loadFrames(String id) async {
    try {
      final f = _frameFile(id);
      if (f == null || !f.existsSync()) return [];
      final list = jsonDecode(await f.readAsString()) as List;
      return list.map((e) => PoseFrame.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> updateSet(SetRecord s) async {
    await _persistSets();
    notifyListeners();
    unawaited(cloud.pushSet(s, avgRange: s.avgRange, avgTempoMs: s.avgTempoMs));
  }

  Future<void> deleteSet(SetRecord s) async {
    sets.removeWhere((e) => e.id == s.id);
    await _persistSets();
    try {
      _frameFile(s.id)?.deleteSync();
      if (s.videoPath != null) File(s.videoPath!).deleteSync();
    } catch (_) {}
    notifyListeners();
  }

  // --- plan ----------------------------------------------------------------
  Future<void> savePlan(Plan p) async {
    plan = p;
    await _prefs.setString(_kPlan, jsonEncode(p.toJson()));
    notifyListeners();
    await Reminders.apply(p);
  }

  /// Exercise planned for today, if any.
  Exercise? get todayPlanned {
    final id = plan.days[DateTime.now().weekday];
    return id == null ? null : exerciseById(id);
  }

  SetSummary summaryOf(SetRecord s) => summarize(s.reps, exerciseById(s.exerciseId));

  @override
  void dispose() {
    _restTimer?.cancel();
    super.dispose();
  }
}

/// Gives every screen access to the shared [AppState].
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
