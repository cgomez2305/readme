import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/analyze_screen.dart';
import 'screens/home_screen.dart';
import 'screens/team_screen.dart';
import 'screens/techniques_screen.dart';
import 'theme/app_theme.dart';
import 'widgets/glass.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.light.copyWith(
    statusBarColor: Colors.transparent,
    systemNavigationBarColor: Colors.transparent,
  ));
  runApp(const FulcroApp());
}

class FulcroApp extends StatelessWidget {
  const FulcroApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fulcro',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: const Shell(),
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
    (Icons.groups_rounded, 'Equipo'),
    (Icons.play_circle_outline_rounded, 'Técnicas'),
  ];

  // Screens are built only while selected, so the camera is released when leaving Analizar.
  Widget _screen() => switch (_index) {
        0 => HomeScreen(onAnalyze: () => setState(() => _index = 1)),
        1 => const AnalyzeScreen(),
        2 => const TeamScreen(),
        _ => const TechniquesScreen(),
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
                  onTap: () => setState(() => _index = i),
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
                            fontSize: 11,
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
