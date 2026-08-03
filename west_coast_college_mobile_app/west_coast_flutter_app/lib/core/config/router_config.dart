import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../features/auth/auth_provider.dart';
import '../../features/auth/login/login_page.dart';
import '../../features/auth/splash/splash_page.dart';
import '../../features/dashboard/dashboard_page.dart';
import '../../features/profile/profile_page.dart';
import '../../features/schedule/schedule_page.dart';
import '../../features/grades/grades_page.dart';
import '../../features/announcements/announcements_page.dart';
import '../../features/documents/documents_page.dart';
import '../../features/support/support_page.dart';
import '../../features/settings/settings_page.dart';

enum AppRoute {
  splash,
  login,
  dashboard,
  schedule,
  grades,
  announcements,
  documents,
  profile,
  support,
}

final routerConfig = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(
      path: '/splash',
      name: AppRoute.splash.name,
      builder: (context, state) => const SplashPage(),
    ),
    GoRoute(
      path: '/login',
      name: AppRoute.login.name,
      builder: (context, state) => const LoginPage(),
    ),
    GoRoute(
      path: '/dashboard',
      name: AppRoute.dashboard.name,
      builder: (context, state) => const DashboardPage(),
    ),
    GoRoute(
      path: '/schedule',
      name: AppRoute.schedule.name,
      builder: (context, state) => const SchedulePage(),
    ),
    GoRoute(
      path: '/grades',
      name: AppRoute.grades.name,
      builder: (context, state) => const GradesPage(),
    ),
    GoRoute(
      path: '/announcements',
      name: AppRoute.announcements.name,
      builder: (context, state) => const AnnouncementsPage(),
    ),
    GoRoute(
      path: '/documents',
      name: AppRoute.documents.name,
      builder: (context, state) => const DocumentsPage(),
    ),
    GoRoute(
      path: '/profile',
      name: AppRoute.profile.name,
      builder: (context, state) => const ProfilePage(),
    ),
    GoRoute(
      path: '/support',
      name: AppRoute.support.name,
      builder: (context, state) => const SupportPage(),
    ),
    GoRoute(
      path: '/settings',
      name: 'settings',
      builder: (context, state) => const SettingsPage(),
    ),
  ],
  redirect: (context, state) {
    final authProvider = context.read<AuthProvider>();
    final isAuthenticated = authProvider.isAuthenticated;
    // Redirect to login if not authenticated
    final isAuthRoute = state.matchedLocation == '/login' || 
                       state.matchedLocation == '/splash';
    
    if (!isAuthenticated && !isAuthRoute) {
      return '/login';
    }

    // Redirect to dashboard if authenticated and on login/splash
    if (isAuthenticated && isAuthRoute) {
      return '/dashboard';
    }

    return null;
  },
);

// Placeholder widgets for routes not yet implemented
class SchedulePlaceholder extends StatelessWidget {
  const SchedulePlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Schedule')),
      body: const Center(child: Text('Schedule - Coming Soon')),
    );
  }
}

class GradesPlaceholder extends StatelessWidget {
  const GradesPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Grades')),
      body: const Center(child: Text('Grades - Coming Soon')),
    );
  }
}

class AnnouncementsPlaceholder extends StatelessWidget {
  const AnnouncementsPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Announcements')),
      body: const Center(child: Text('Announcements - Coming Soon')),
    );
  }
}

class DocumentsPlaceholder extends StatelessWidget {
  const DocumentsPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Documents')),
      body: const Center(child: Text('Documents - Coming Soon')),
    );
  }
}

class ProfilePlaceholder extends StatelessWidget {
  const ProfilePlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: const Center(child: Text('Profile - Coming Soon')),
    );
  }
}

class SupportPlaceholder extends StatelessWidget {
  const SupportPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Support')),
      body: const Center(child: Text('Support - Coming Soon')),
    );
  }
}
