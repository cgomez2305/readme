import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'data/app_state.dart';
import 'screens/analyze_screen.dart';
import 'screens/home_screen.dart';
import 'screens/plan_screen.dart';
import 'screens/progress_screen.dart';
import 'screens/team_screen.dart';
import 'services/cloud.dart';
import 'theme/app_theme.dart';
import 'widgets/glass.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.light.copyWith(
    statusBarColor: Colors.transparent,
    systemNavigationBarColor: Colors.transparent,
  ));
  try {
    await CloudService.init();
  } catch (e) {
    debugPrint('Fulcro: no se pudo iniciar Supabase ($e)');
  }
  final state = await AppState.load();
  runApp(FulcroApp(state: state));
}

class FulcroApp extends StatelessWidget {
  const FulcroApp({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: state,
      child: MaterialApp(
        title: 'Fulcro',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const Shell(),
      ),
    );
  }
}

class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _index = 0;

  static const _tabs = [
    (Icons.home_rounded, 'Inicio'),
    (Icons.adjust_rounded, 'Analizar'),
    (Icons.show_chart_rounded, 'Progreso'),
    (Icons.groups_rounded, 'Equipo'),
    (Icons.event_note_rounded, 'Plan'),
  ];

  void _go(int i) => setState(() => _index = i);

  // Screens are built only while selected, so the camera is released when leaving Analizar.
  Widget _screen() => switch (_index) {
        0 => HomeScreen(onAnalyze: () => _go(1), onPlan: () => _go(4)),
        1 => const AnalyzeScreen(),
        2 => const ProgressScreen(),
        3 => const TeamScreen(),
        _ => const PlanScreen(),
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: AmbientBackground(child: SafeArea(bottom: false, child: _screen())),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(14, 0, 14, 12 + MediaQuery.of(context).padding.bottom),
        child: Glass(
          radius: 26,
          padding: const EdgeInsets.all(6),
          child: Row(children: [
            for (final (i, t) in _tabs.indexed)
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(20),
                  onTap: () => _go(i),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: i == _index ? FulcroColors.glassStrong : Colors.transparent,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(t.$1, size: 22, color: i == _index ? FulcroColors.copper : FulcroColors.muted),
                      const SizedBox(height: 2),
                      Text(t.$2,
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w600,
                            color: i == _index ? FulcroColors.text : FulcroColors.muted,
                          )),
                    ]),
                  ),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}
