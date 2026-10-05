import 'package:flutter/material.dart';

import '../analysis/progress.dart';
import '../data/app_state.dart';
import '../data/exercises.dart';
import '../services/cloud.dart';
import '../theme/app_theme.dart';
import '../widgets/glass.dart';

/// Group: login, create or join with a code, weekly activity and comparison per exercise.
class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  final _code = TextEditingController();
  final _groupName = TextEditingController();
  bool _register = false;
  bool _busy = false;
  String? _message;
  bool _compare = false;
  String _exerciseId = exercises.first.id;

  Future<List<MemberActivity>>? _activity;
  Future<List<MemberExerciseStats>>? _stats;

  @override
  void dispose() {
    for (final c in [_email, _password, _name, _code, _groupName]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<String?> Function() action) async {
    setState(() {
      _busy = true;
      _message = null;
    });
    final err = await action();
    if (mounted) {
      setState(() {
        _busy = false;
        _message = err;
        _activity = null;
        _stats = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final cloud = app.cloud;

    return ListenableBuilder(
      listenable: cloud,
      builder: (context, _) {
        final Widget body;
        if (!CloudService.configured) {
          body = _notConfigured();
        } else if (!cloud.signedIn) {
          body = _auth(cloud);
        } else if (cloud.loadingGroup && cloud.group == null) {
          body = const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(color: FulcroColors.copper)));
        } else if (cloud.group == null) {
          body = _noGroup(cloud);
        } else {
          body = _group(cloud);
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 120),
          children: [
            Eyebrow(cloud.group?.name ?? 'Grupo de entrenamiento'),
            Text('Equipo', style: displayStyle(size: 22, weight: FontWeight.w500)),
            const SizedBox(height: 14),
            body,
            const SizedBox(height: 20),
            _plans(),
          ],
        );
      },
    );
  }

  Widget _notConfigured() => const Glass(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Grupo sin conectar', style: TextStyle(fontWeight: FontWeight.w700)),
          SizedBox(height: 6),
          Text(
            'Esta versión no tiene servidor configurado, así que todo se guarda solo en tu móvil. '
            'Para compartir progreso con tu grupo hay que conectar Supabase (ver README, sección Grupo).',
            style: TextStyle(color: FulcroColors.muted, fontSize: 13),
          ),
        ]),
      );

  InputDecoration _dec(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: FulcroColors.muted, fontSize: 13),
        filled: true,
        fillColor: FulcroColors.glass,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      );

  Widget _auth(CloudService cloud) => Glass(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(_register ? 'Crear cuenta' : 'Iniciar sesión', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 4),
          const Text('Solo se comparten los resúmenes de tus series con tu grupo. El vídeo se queda en tu móvil.',
              style: TextStyle(color: FulcroColors.muted, fontSize: 12)),
          const SizedBox(height: 12),
          if (_register) ...[TextField(controller: _name, decoration: _dec('Tu nombre'), textCapitalization: TextCapitalization.words), const SizedBox(height: 10)],
          TextField(controller: _email, decoration: _dec('Correo'), keyboardType: TextInputType.emailAddress, autocorrect: false),
          const SizedBox(height: 10),
          TextField(controller: _password, decoration: _dec('Contraseña (mínimo 6 caracteres)'), obscureText: true),
          if (_message != null) ...[
            const SizedBox(height: 10),
            Text(_message!, style: const TextStyle(color: FulcroColors.warn, fontSize: 13)),
          ],
          const SizedBox(height: 14),
          GradientButton(
            label: _busy ? 'Un momento...' : (_register ? 'Crear cuenta' : 'Entrar'),
            onPressed: _busy
                ? () {}
                : () => _run(() async {
                      final email = _email.text.trim();
                      if (email.isEmpty || _password.text.isEmpty) return 'Escribe tu correo y contraseña.';
                      if (_register) {
                        if (_name.text.trim().isEmpty) return 'Escribe tu nombre.';
                        final err = await cloud.signUp(email, _password.text, _name.text.trim());
                        if (err != null) return err;
                        if (!cloud.signedIn) return 'Cuenta creada. Confirma tu correo con el enlace que te enviamos y luego inicia sesión.';
                        return null;
                      }
                      return cloud.signIn(email, _password.text);
                    }),
          ),
          TextButton(
            onPressed: () => setState(() {
              _register = !_register;
              _message = null;
            }),
            child: Text(_register ? 'Ya tengo cuenta' : 'No tengo cuenta'),
          ),
        ]),
      );

  Widget _noGroup(CloudService cloud) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Glass(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Únete con un código', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            TextField(controller: _code, decoration: _dec('Código de 6 letras'), textCapitalization: TextCapitalization.characters),
            const SizedBox(height: 10),
            GradientButton(label: 'Unirme', onPressed: _busy ? () {} : () => _run(() => cloud.joinGroup(_code.text))),
          ]),
        ),
        const SizedBox(height: 12),
        Glass(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('O crea tu grupo', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            TextField(controller: _groupName, decoration: _dec('Nombre del grupo'), textCapitalization: TextCapitalization.words),
            const SizedBox(height: 10),
            GradientButton(
              label: 'Crear grupo',
              ghost: true,
              onPressed: _busy
                  ? () {}
                  : () => _run(() async {
                        if (_groupName.text.trim().isEmpty) return 'Escribe un nombre para el grupo.';
                        return cloud.createGroup(_groupName.text);
                      }),
            ),
          ]),
        ),
        if (_message != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_message!, style: const TextStyle(color: FulcroColors.warn, fontSize: 13))),
        TextButton(onPressed: cloud.signOut, child: Text('Cerrar sesión (${cloud.displayName})')),
      ]);

  Widget _group(CloudService cloud) {
    final g = cloud.group!;
    _activity ??= cloud.activity();
    _stats ??= cloud.exerciseStats(_exerciseId);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Glass(
        child: Row(children: [
          const Expanded(
            child: Text('Código para invitar', style: TextStyle(color: FulcroColors.muted, fontSize: 13)),
          ),
          Text(g.code, style: displayStyle(size: 20)),
        ]),
      ),
      const SizedBox(height: 12),
      Segmented<bool>(options: const [false, true], value: _compare, onChanged: (v) => setState(() => _compare = v), label: (v) => v ? 'Comparar' : 'Esta semana'),
      const SizedBox(height: 12),
      if (!_compare) _weekly() else _comparison(cloud),
      const SizedBox(height: 6),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        TextButton(
          onPressed: () => setState(() {
            _activity = null;
            _stats = null;
          }),
          child: const Text('Actualizar'),
        ),
        TextButton(onPressed: () => _run(cloud.leaveGroup), child: const Text('Salir del grupo')),
      ]),
      TextButton(onPressed: cloud.signOut, child: Text('Cerrar sesión (${cloud.displayName})')),
    ]);
  }

  Widget _weekly() => FutureBuilder<List<MemberActivity>>(
        future: _activity,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator(color: FulcroColors.copper));
          if (snap.hasError) return const Glass(child: Text('No se pudo cargar la actividad. Revisa tu internet y pulsa Actualizar.', style: TextStyle(color: FulcroColors.muted)));
          final list = snap.data!;
          return Glass(
            padding: EdgeInsets.zero,
            child: Column(children: [
              for (final (i, m) in list.indexed) ...[
                if (i > 0) const Divider(height: 1, color: FulcroColors.edge),
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: FulcroColors.copper,
                    foregroundColor: const Color(0xFF1A0D05),
                    child: Text(m.name.isEmpty ? '?' : m.name[0].toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  title: Text(m.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(
                    m.lastAt == null ? 'Sin series todavía' : '${exerciseById(m.lastExercise ?? '').name} · ${formatDay(m.lastAt!)}',
                    style: const TextStyle(color: FulcroColors.muted, fontSize: 13),
                  ),
                  trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text('${m.daysWeek} días', style: const TextStyle(fontWeight: FontWeight.w800)),
                    Text('${m.setsWeek} series', style: const TextStyle(color: FulcroColors.muted, fontSize: 11)),
                  ]),
                ),
              ],
            ]),
          );
        },
      );

  Widget _comparison(CloudService cloud) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          height: 40,
          child: ListView(scrollDirection: Axis.horizontal, children: [
            for (final e in exercises)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(e.name),
                  selected: e.id == _exerciseId,
                  onSelected: (_) => setState(() {
                    _exerciseId = e.id;
                    _stats = cloud.exerciseStats(e.id);
                  }),
                ),
              ),
          ]),
        ),
        const SizedBox(height: 12),
        FutureBuilder<List<MemberExerciseStats>>(
          future: _stats,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator(color: FulcroColors.copper));
            if (snap.hasError) return const Glass(child: Text('No se pudo cargar la comparación.', style: TextStyle(color: FulcroColors.muted)));
            final list = snap.data!;
            final top = list.map((m) => m.avgRange).fold<double>(0, (a, b) => a > b ? a : b);
            return Glass(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Rango medio · últimos 30 días', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                for (final m in list) ...[
                  Row(children: [
                    SizedBox(width: 76, child: Text(m.name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13))),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(value: top == 0 ? 0 : m.avgRange / top, minHeight: 12, backgroundColor: Colors.white10, color: FulcroColors.teal),
                      ),
                    ),
                    SizedBox(
                      width: 92,
                      child: Text(
                        m.sets == 0 ? 'sin datos' : '${m.avgRange.round()}° · ${m.bestKg % 1 == 0 ? m.bestKg.toInt() : m.bestKg} kg',
                        textAlign: TextAlign.right,
                        style: const TextStyle(fontSize: 12, color: FulcroColors.muted),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 8),
                ],
              ]),
            );
          },
        ),
      ]);

  Widget _plans() => const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Planes', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        SizedBox(height: 10),
        Glass(
          borderColor: Color(0x803FE0C5),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Grupo', style: TextStyle(fontWeight: FontWeight.w700)),
                Text('Hasta 10 atletas. Análisis ilimitado.', style: TextStyle(color: FulcroColors.muted, fontSize: 13)),
              ]),
            ),
            Pill('Actual', color: FulcroColors.teal),
          ]),
        ),
        SizedBox(height: 10),
        Glass(
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Pro', style: TextStyle(fontWeight: FontWeight.w700)),
                Text('Comparación con referencias y plan adaptativo.', style: TextStyle(color: FulcroColors.muted, fontSize: 13)),
              ]),
            ),
            Text('Próximamente', style: TextStyle(fontSize: 11, color: FulcroColors.amber)),
          ]),
        ),
      ]);
}
