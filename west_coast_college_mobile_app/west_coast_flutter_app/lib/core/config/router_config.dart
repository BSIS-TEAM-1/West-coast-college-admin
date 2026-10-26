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
import '../../features/settings/presentation/pages/settings_page.dart';

enum AppRoute {
  splash,
  login,
  dashboard,
  schedule,
  grades,
  announcements,
  profile,
  settings,
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

/// Fade-through + slight rise: the mobile-standard page transition that
/// respects both light and dark themes. Uses a single implicit-style tween
/// on opacity and translateY, so it stays cheap even on low-end devices.
CustomTransitionPage<void> _fadeThroughPage({
  required Widget child,
  required GoRouterState state,
}) {
  return CustomTransitionPage(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 320),
    reverseTransitionDuration: const Duration(milliseconds: 260),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
      return FadeTransition(
        opacity: Tween<double>(begin: 0, end: 1).animate(curved),
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.035),
            end: Offset.zero,
          ).animate(curved),
          child: child,
        ),
      );
    },
  );
}

final routerProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _GoRouterRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    // The splash route is the genuine initialization screen: it is shown only
    // while AuthController restores the session from Secure Storage, then the
    // redirect below sends the student to /dashboard or /login.
    initialLocation: '/splash',
    refreshListenable: refreshNotifier,
    routes: [
      GoRoute(
        path: '/splash',
        name: AppRoute.splash.name,
        pageBuilder: (context, state) => _fadeThroughPage(
          child: const AppSplashPage(),
          state: state,
        ),
      ),
      GoRoute(
        path: '/login',
        name: AppRoute.login.name,
        pageBuilder: (context, state) => _fadeThroughPage(
          child: const LoginPage(),
          state: state,
        ),
      ),
      GoRoute(
        path: '/',
        name: 'home',
        redirect: (context, state) {
          // Only handle the exact root URL. NOTE: use uri.path, not
          // matchedLocation — parent redirects run before child matching,
          // so matchedLocation is '/' for every sub-route navigation.
          if (state.uri.path != '/') return null;
          final authState = ref.read(authControllerProvider);
          // While the session is still being restored the splash screen is
          // the initialization view for any entry point.
          if (authState.status == AuthStatus.checking) {
            return '/splash';
          }
          if (authState.status == AuthStatus.authenticated) {
            return '/dashboard';
          }
          return '/login';
        },
        routes: [
          GoRoute(
            path: 'dashboard',
            name: AppRoute.dashboard.name,
            pageBuilder: (context, state) => _fadeThroughPage(
              child: const DashboardPage(),
              state: state,
            ),
          ),
          GoRoute(
            path: 'schedule',
            name: AppRoute.schedule.name,
            pageBuilder: (context, state) => _fadeThroughPage(
              child: const SchedulePage(),
              state: state,
            ),
          ),
          GoRoute(
            path: 'grades',
            name: AppRoute.grades.name,
            pageBuilder: (context, state) => _fadeThroughPage(
              child: const GradesPage(),
              state: state,
            ),
          ),
          GoRoute(
            path: 'announcements',
            name: AppRoute.announcements.name,
            pageBuilder: (context, state) => _fadeThroughPage(
              child: const AnnouncementsPage(),
              state: state,
            ),
          ),
          GoRoute(
            path: 'profile',
            name: AppRoute.profile.name,
            pageBuilder: (context, state) => _fadeThroughPage(
              child: const ProfilePage(),
              state: state,
            ),
          ),
          GoRoute(
            path: 'settings',
            name: AppRoute.settings.name,
            pageBuilder: (context, state) => _fadeThroughPage(
              child: const SettingsPage(),
              state: state,
            ),
          ),
        ],
      ),
    ],
    redirect: (context, state) {
      final authState = ref.read(authControllerProvider);
      final isAuthRoute = _authRoutes.contains(state.matchedLocation);

      // Still checking Secure Storage — the splash screen is the loading
      // surface for every entry point while initialization is running.
      if (authState.status == AuthStatus.checking) {
        return state.matchedLocation == '/splash' ? null : '/splash';
      }

      if (authState.status == AuthStatus.unauthenticated) {
        return state.matchedLocation == '/login' ? null : '/login';
      }

      if (authState.status == AuthStatus.authenticated && isAuthRoute) {
        return '/dashboard';
      }

      return null;
    },
  );
});
