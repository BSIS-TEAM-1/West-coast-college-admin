import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/pages/app_splash_page.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/providers/auth_controller.dart';
import '../../features/dashboard/presentation/pages/dashboard_page.dart';
import '../../features/grades/presentation/pages/grades_page.dart';
import '../../features/schedule/presentation/pages/schedule_page.dart';
import '../../features/announcements/presentation/pages/announcements_page.dart';
import '../../features/profile/presentation/pages/profile_page.dart';

enum AppRoute {
  splash,
  login,
  dashboard,
  schedule,
  grades,
  announcements,
  profile,
}

const _authRoutes = {'/login', '/splash'};

/// Bridges Riverpod's [AuthController] to GoRouter's [Listenable]-based
/// `refreshListenable`, so navigation re-evaluates whenever auth status
/// changes (login, logout, session expiry).
class _GoRouterRefreshNotifier extends ChangeNotifier {
  _GoRouterRefreshNotifier(Ref ref) {
    ref.listen<AuthState>(authControllerProvider, (previous, next) {
      if (previous?.status != next.status) {
        notifyListeners();
      }
    });
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _GoRouterRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    initialLocation: '/login',
    refreshListenable: refreshNotifier,
    routes: [
      GoRoute(
        path: '/splash',
        name: AppRoute.splash.name,
        builder: (context, state) => const AppSplashPage(),
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
        path: '/profile',
        name: AppRoute.profile.name,
        builder: (context, state) => const ProfilePage(),
      ),
    ],
    redirect: (context, state) {
      final authState = ref.read(authControllerProvider);
      final isAuthRoute = _authRoutes.contains(state.matchedLocation);

      // Still checking Secure Storage — stay on login if already there,
      // otherwise go to login (not splash).
      if (authState.status == AuthStatus.checking) {
        return state.matchedLocation == '/login' ? null : '/login';
      }

      if (authState.status == AuthStatus.unauthenticated && !isAuthRoute) {
        return '/login';
      }

      if (authState.status == AuthStatus.authenticated && isAuthRoute) {
        return '/dashboard';
      }

      return null;
    },
  );
});
