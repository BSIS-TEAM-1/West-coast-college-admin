import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz_data;

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FlutterLocalNotificationsPlugin _notificationsPlugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;

    // Initialize timezone data
    tz_data.initializeTimeZones();

    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');

    const DarwinInitializationSettings initializationSettingsDarwin =
        DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const InitializationSettings initializationSettings =
        InitializationSettings(
      android: initializationSettingsAndroid,
      iOS: initializationSettingsDarwin,
    );

    await _notificationsPlugin.initialize(
      initializationSettings,
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    // Request permission on Android 13+
    if (Platform.isAndroid) {
      final AndroidFlutterLocalNotificationsPlugin? androidImplementation =
          _notificationsPlugin.resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>();
      await androidImplementation?.requestNotificationsPermission();
    }

    _initialized = true;
  }

  void _onNotificationTap(NotificationResponse response) {
    debugPrint('Notification tapped: ${response.payload}');
    // Handle navigation based on notification type
    // This can be expanded to navigate to specific screens
  }

  Future<void> showEvaluationReminder({
    required String subjectCode,
    required String professorName,
    required String deadline,
  }) async {
    const AndroidNotificationDetails androidPlatformChannelSpecifics =
        AndroidNotificationDetails(
      'evaluation_channel',
      'Professor Evaluations',
      channelDescription: 'Notifications for professor evaluation reminders',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      icon: '@mipmap/ic_launcher',
    );

    const NotificationDetails platformChannelSpecifics =
        NotificationDetails(android: androidPlatformChannelSpecifics);

    await _notificationsPlugin.show(
      DateTime.now().millisecondsSinceEpoch % 100000,
      'Evaluation Reminder',
      'Complete your evaluation for $subjectCode with $professorName',
      platformChannelSpecifics,
      payload: 'evaluation:$subjectCode',
    );
  }

  Future<void> showGradeReleased({
    required String subjectCode,
    required String grade,
    required String remarks,
  }) async {
    const AndroidNotificationDetails androidPlatformChannelSpecifics =
        AndroidNotificationDetails(
      'grades_channel',
      'Grade Updates',
      channelDescription: 'Notifications for grade releases and updates',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      icon: '@mipmap/ic_launcher',
    );

    const NotificationDetails platformChannelSpecifics =
        NotificationDetails(android: androidPlatformChannelSpecifics);

    await _notificationsPlugin.show(
      DateTime.now().millisecondsSinceEpoch % 100000,
      'Grade Released',
      'Your grade for $subjectCode is now available: $grade ($remarks)',
      platformChannelSpecifics,
      payload: 'grade:$subjectCode',
    );
  }

  Future<void> showAllGradesUnlocked() async {
    const AndroidNotificationDetails androidPlatformChannelSpecifics =
        AndroidNotificationDetails(
      'grades_channel',
      'Grade Updates',
      channelDescription: 'Notifications for grade releases and updates',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      icon: '@mipmap/ic_launcher',
    );

    const NotificationDetails platformChannelSpecifics =
        NotificationDetails(android: androidPlatformChannelSpecifics);

    await _notificationsPlugin.show(
      DateTime.now().millisecondsSinceEpoch % 100000,
      'Grades Unlocked',
      'All your grades are now available after completing evaluations',
      platformChannelSpecifics,
      payload: 'grades_unlocked',
    );
  }

  Future<void> showAnnouncement({
    required String title,
    required String message,
  }) async {
    const AndroidNotificationDetails androidPlatformChannelSpecifics =
        AndroidNotificationDetails(
      'announcements_channel',
      'Announcements',
      channelDescription: 'Important announcements from the college',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      icon: '@mipmap/ic_launcher',
    );

    const NotificationDetails platformChannelSpecifics =
        NotificationDetails(android: androidPlatformChannelSpecifics);

    await _notificationsPlugin.show(
      DateTime.now().millisecondsSinceEpoch % 100000,
      title,
      message,
      platformChannelSpecifics,
      payload: 'announcement',
    );
  }

  Future<void> scheduleEvaluationReminder({
    required String subjectCode,
    required String professorName,
    required DateTime deadline,
  }) async {
    // Schedule a reminder 1 day before deadline
    final reminderTime = deadline.subtract(const Duration(days: 1));

    const AndroidNotificationDetails androidPlatformChannelSpecifics =
        AndroidNotificationDetails(
      'evaluation_channel',
      'Professor Evaluations',
      channelDescription: 'Notifications for professor evaluation reminders',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      icon: '@mipmap/ic_launcher',
    );

    const NotificationDetails platformChannelSpecifics =
        NotificationDetails(android: androidPlatformChannelSpecifics);

    await _notificationsPlugin.zonedSchedule(
      DateTime.now().millisecondsSinceEpoch % 100000,
      'Evaluation Deadline Approaching',
      'Complete your evaluation for $subjectCode by tomorrow',
      tz.TZDateTime.from(reminderTime, tz.local),
      platformChannelSpecifics,
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation:
          UILocalNotificationDateInterpretation.absoluteTime,
      payload: 'evaluation_reminder:$subjectCode',
    );
  }

  Future<void> cancelAll() async {
    await _notificationsPlugin.cancelAll();
  }
}
