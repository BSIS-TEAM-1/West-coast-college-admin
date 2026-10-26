import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'core/config/router_config.dart';
import 'core/services/notification_service.dart';
import 'features/settings/presentation/providers/settings_controller.dart';

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return const ProviderScope(child: AppView());
  }
}

class AppView extends ConsumerStatefulWidget {
  const AppView({super.key});

  @override
  ConsumerState<AppView> createState() => _AppViewState();
}

class _AppViewState extends ConsumerState<AppView> {
  @override
  void initState() {
    super.initState();
    _initializeNotifications();
  }

  Future<void> _initializeNotifications() async {
    final notificationService = NotificationService();
    await notificationService.initialize();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final settings = ref.watch(settingsControllerProvider);
    return MaterialApp.router(
      title: 'WccPortal',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: settings.themeMode,
      routerConfig: router,
    );
  }
}
