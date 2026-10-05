import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../data/exercises.dart';
import '../data/models.dart';

/// Weekly training reminders: one notification per planned weekday at the chosen time.
class Reminders {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static Future<void> _init() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    try {
      final info = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(info.identifier));
    } catch (e) {
      debugPrint('Fulcro: no se pudo leer la zona horaria, uso UTC ($e)');
    }
    await _plugin.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    );
    _ready = true;
  }

  /// Asks for notification permission (Android 13+). Returns whether it was granted.
  static Future<bool> requestPermission() async {
    try {
      await _init();
      final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      return await android?.requestNotificationsPermission() ?? false;
    } catch (e) {
      debugPrint('Fulcro: permiso de notificaciones falló ($e)');
      return false;
    }
  }

  /// Replaces all scheduled reminders with the ones in [plan].
  static Future<void> apply(Plan plan) async {
    try {
      await _init();
      await _plugin.cancelAll();
      if (!plan.remindersOn) return;
      for (final entry in plan.days.entries) {
        final ex = exerciseById(entry.value);
        await _plugin.zonedSchedule(
          id: entry.key,
          title: 'Hoy toca entrenar',
          body: '${ex.name}. Graba tu serie en Fulcro.',
          scheduledDate: _nextWeekday(entry.key, plan.reminderHour, plan.reminderMinute),
          notificationDetails: const NotificationDetails(
            android: AndroidNotificationDetails(
              'plan',
              'Plan semanal',
              channelDescription: 'Recordatorios de tus días de entrenamiento',
            ),
          ),
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
          matchDateTimeComponents: DateTimeComponents.dayOfWeekAndTime,
        );
      }
    } catch (e) {
      debugPrint('Fulcro: no se pudieron programar los recordatorios ($e)');
    }
  }

  static tz.TZDateTime _nextWeekday(int weekday, int hour, int minute) {
    final now = tz.TZDateTime.now(tz.local);
    var d = tz.TZDateTime(tz.local, now.year, now.month, now.day, hour, minute);
    while (d.weekday != weekday || !d.isAfter(now)) {
      d = d.add(const Duration(days: 1));
    }
    return d;
  }
}
