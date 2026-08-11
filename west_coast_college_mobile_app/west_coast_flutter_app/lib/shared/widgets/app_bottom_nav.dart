import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';

class AppBottomNav extends StatelessWidget {
  const AppBottomNav({
    super.key,
    required this.currentPath,
  });

  final String currentPath;

  @override
  Widget build(BuildContext context) {
    return NavigationBar(
      elevation: AppDimensions.elevationMedium,
      backgroundColor: AppColors.surface,
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home),
          label: 'Home',
        ),
        NavigationDestination(
          icon: Icon(Icons.calendar_today_outlined),
          selectedIcon: Icon(Icons.calendar_today),
          label: 'Schedule',
        ),
        NavigationDestination(
          icon: Icon(Icons.school_outlined),
          selectedIcon: Icon(Icons.school),
          label: 'Grades',
        ),
        NavigationDestination(
          icon: Icon(Icons.notifications_outlined),
          selectedIcon: Icon(Icons.notifications),
          label: 'Alerts',
        ),
        NavigationDestination(
          icon: Icon(Icons.person_outlined),
          selectedIcon: Icon(Icons.person),
          label: 'Profile',
        ),
      ],
      selectedIndex: _getSelectedIndex(currentPath),
      onDestinationSelected: (index) {
        _navigateToDestination(context, index);
      },
    );
  }

  int _getSelectedIndex(String path) {
    switch (path) {
      case '/dashboard':
        return 0;
      case '/schedule':
        return 1;
      case '/grades':
        return 2;
      case '/announcements':
        return 3;
      case '/profile':
        return 4;
      default:
        if (path.startsWith('/dashboard')) return 0;
        if (path.startsWith('/schedule')) return 1;
        if (path.startsWith('/grades')) return 2;
        if (path.startsWith('/announcements')) return 3;
        if (path.startsWith('/profile')) return 4;
        return 0;
    }
  }

  void _navigateToDestination(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/dashboard');
        break;
      case 1:
        context.go('/schedule');
        break;
      case 2:
        context.go('/grades');
        break;
      case 3:
        context.go('/announcements');
        break;
      case 4:
        context.go('/profile');
        break;
    }
  }
}