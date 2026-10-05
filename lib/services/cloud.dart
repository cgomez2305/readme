import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/models.dart';

class GroupInfo {
  const GroupInfo({required this.id, required this.name, required this.code});
  final String id;
  final String name;
  final String code;
}

class MemberActivity {
  const MemberActivity({
    required this.userId,
    required this.name,
    required this.daysWeek,
    required this.setsWeek,
    required this.avgRangeWeek,
    this.lastExercise,
    this.lastAt,
  });
  final String userId;
  final String name;
  final int daysWeek;
  final int setsWeek;
  final double avgRangeWeek;
  final String? lastExercise;
  final DateTime? lastAt;
}

class MemberExerciseStats {
  const MemberExerciseStats({
    required this.userId,
    required this.name,
    required this.sets,
    required this.avgRange,
    required this.avgTempoMs,
    required this.bestKg,
  });
  final String userId;
  final String name;
  final int sets;
  final double avgRange;
  final double avgTempoMs;
  final double bestKg;
}

/// Login, group and shared stats on Supabase. Everything is optional: without
/// SUPABASE_URL / SUPABASE_KEY the app works fully offline.
/// Only summaries are shared with the group, never the video.
class CloudService extends ChangeNotifier {
  static const _url = String.fromEnvironment('SUPABASE_URL');
  static const _key = String.fromEnvironment('SUPABASE_KEY');
  static bool get configured => _url.isNotEmpty && _key.isNotEmpty;

  static Future<void> init() async {
    if (configured) await Supabase.initialize(url: _url, publishableKey: _key);
  }

  CloudService() {
    if (configured) {
      Supabase.instance.client.auth.onAuthStateChange.listen((_) {
        group = null;
        notifyListeners();
        refreshGroup();
      });
      refreshGroup();
    }
  }

  SupabaseClient get _c => Supabase.instance.client;

  User? get user => configured ? _c.auth.currentUser : null;
  bool get signedIn => user != null;
  String get displayName => (user?.userMetadata?['name'] as String?) ?? user?.email ?? '';

  GroupInfo? group;
  bool loadingGroup = false;

  Future<String?> signIn(String email, String password) => _auth(() => _c.auth.signInWithPassword(email: email, password: password));

  /// Returns an error message, or null on success. When the project requires email
  /// confirmation the user is created but not signed in yet.
  Future<String?> signUp(String email, String password, String name) =>
      _auth(() => _c.auth.signUp(email: email, password: password, data: {'name': name}));

  Future<String?> _auth(Future<dynamic> Function() action) async {
    try {
      await action();
      return null;
    } on AuthException catch (e) {
      return _spanish(e.message);
    } catch (e) {
      return 'No hay conexión con el servidor. Revisa tu internet.';
    }
  }

  String _spanish(String m) {
    final s = m.toLowerCase();
    if (s.contains('invalid login')) return 'Correo o contraseña incorrectos.';
    if (s.contains('already registered')) return 'Ese correo ya tiene cuenta. Inicia sesión.';
    if (s.contains('password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
    if (s.contains('email not confirmed')) return 'Confirma tu correo con el enlace que te enviamos.';
    return m;
  }

  Future<void> signOut() async {
    await _c.auth.signOut();
  }

  Future<void> refreshGroup() async {
    if (!configured || !signedIn) return;
    loadingGroup = true;
    notifyListeners();
    try {
      final rows = await _c.rpc('my_group');
      final list = rows as List;
      group = list.isEmpty
          ? null
          : GroupInfo(
              id: list.first['id'] as String,
              name: list.first['name'] as String,
              code: list.first['code'] as String,
            );
    } catch (e) {
      debugPrint('Fulcro: no se pudo leer el grupo ($e)');
    }
    loadingGroup = false;
    notifyListeners();
  }

  Future<String?> createGroup(String name) => _rpcAction('create_group', {'p_name': name});
  Future<String?> joinGroup(String code) => _rpcAction('join_group', {'p_code': code.trim().toUpperCase()});
  Future<String?> leaveGroup() => _rpcAction('leave_group', {});

  Future<String?> _rpcAction(String fn, Map<String, dynamic> args) async {
    try {
      await _c.rpc(fn, params: args);
      await refreshGroup();
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    } catch (e) {
      return 'No hay conexión con el servidor. Revisa tu internet.';
    }
  }

  /// Uploads the summary of a set. Failures are silent: the set is already saved locally.
  Future<void> pushSet(SetRecord s, {required double avgRange, required double avgTempoMs}) async {
    if (!configured || !signedIn) return;
    try {
      await _c.from('sets').upsert({
        'id': s.id,
        'user_id': user!.id,
        'exercise': s.exerciseId,
        'arm': s.arm.name,
        'weight_kg': s.weightKg,
        'started_at': s.startedAt.toUtc().toIso8601String(),
        'reps': s.reps.length,
        'avg_range': avgRange,
        'avg_tempo_ms': avgTempoMs,
        'fatigue_rep': s.fatigueRep,
        'pain_zone': s.painZone?.name,
        'pain_level': s.painLevel,
      });
    } catch (e) {
      debugPrint('Fulcro: no se pudo subir la serie ($e)');
    }
  }

  Future<List<MemberActivity>> activity() async {
    final rows = await _c.rpc('group_activity') as List;
    return [
      for (final r in rows)
        MemberActivity(
          userId: r['user_id'] as String,
          name: (r['name'] as String?) ?? 'Atleta',
          daysWeek: (r['days_week'] as num).toInt(),
          setsWeek: (r['sets_week'] as num).toInt(),
          avgRangeWeek: ((r['avg_range_week'] as num?) ?? 0).toDouble(),
          lastExercise: r['last_exercise'] as String?,
          lastAt: r['last_at'] == null ? null : DateTime.parse(r['last_at'] as String).toLocal(),
        ),
    ];
  }

  Future<List<MemberExerciseStats>> exerciseStats(String exerciseId) async {
    final rows = await _c.rpc('group_exercise_stats', params: {'p_exercise': exerciseId}) as List;
    return [
      for (final r in rows)
        MemberExerciseStats(
          userId: r['user_id'] as String,
          name: (r['name'] as String?) ?? 'Atleta',
          sets: (r['sets'] as num).toInt(),
          avgRange: ((r['avg_range'] as num?) ?? 0).toDouble(),
          avgTempoMs: ((r['avg_tempo_ms'] as num?) ?? 0).toDouble(),
          bestKg: ((r['best_kg'] as num?) ?? 0).toDouble(),
        ),
    ];
  }
}
