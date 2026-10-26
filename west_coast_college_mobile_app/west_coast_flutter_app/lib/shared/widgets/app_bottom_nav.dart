import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';
import '../../../core/theme/theme_colors.dart';

/// Mobile-style bottom navigation with a soft-3D active chip.
///
/// Replaces the plain [NavigationBar]: the destination icons animate between
/// outlined/filled, the active one pops onto a gold gradient "3D" tile with a
/// spring (`easeOutBack`) and gold label, and the inactive ones stay quiet.
/// Public API kept identical (`currentPath`) so pages don't change.

class _Destination {
  const _Destination({
    required this.path,
    required this.label,
    required this.icon,
    required this.activeIcon,
  });

  final String path;
  final String label;
  final IconData icon;
  final IconData activeIcon;
}

const _destinations = [
  _Destination(path: '/dashboard', label: 'Home', icon: Icons.home_outlined, activeIcon: Icons.home),
  _Destination(path: '/schedule', label: 'Schedule', icon: Icons.calendar_today_outlined, activeIcon: Icons.calendar_today),
  _Destination(path: '/grades', label: 'Grades', icon: Icons.school_outlined, activeIcon: Icons.school),
  _Destination(path: '/announcements', label: 'Notif', icon: Icons.notifications_outlined, activeIcon: Icons.notifications),
  _Destination(path: '/profile', label: 'Profile', icon: Icons.person_outlined, activeIcon: Icons.person),
];

class AppBottomNav extends StatelessWidget {
  const AppBottomNav({super.key, required this.currentPath});

  final String currentPath;

  int _selectedIndex(String path) {
    for (var i = 0; i < _destinations.length; i++) {
      if (path.startsWith(_destinations[i].path)) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.border)),
        boxShadow: [
          BoxShadow(
            color: isDark
                ? Colors.black.withValues(alpha: .5)
                : AppColors.shadow.withValues(alpha: .08),
            blurRadius: 16,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: AppDimensions.bottomNavHeight - 8,
          child: Row(
            children: [
              for (var i = 0; i < _destinations.length; i++)
                Expanded(
                  child: _NavItem(
                    destination: _destinations[i],
                    selected: i == _selectedIndex(currentPath),
                    colors: colors,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.destination,
    required this.selected,
    required this.colors,
  });

  final _Destination destination;
  final bool selected;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Semantics(
      button: true,
      selected: selected,
      label: destination.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => context.go(destination.path),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Active chip: gold gradient "3D" tile with a spring pop.
            AnimatedContainer(
              duration: const Duration(milliseconds: 320),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.all(1),
              decoration: BoxDecoration(
                gradient: selected
                    ? const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [AppColors.goldSoft, AppColors.goldLight],
                      )
                    : null,
                borderRadius: BorderRadius.circular(14),
                boxShadow: selected
                    ? [
                        BoxShadow(
                          color: AppColors.goldLight.withValues(alpha: isDark ? .22 : .42),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ]
                    : const [],
              ),
              child: AnimatedScale(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutBack,
                scale: selected ? 1.0 : 0.84,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  child: Icon(
                    selected ? destination.activeIcon : destination.icon,
                    key: ValueKey(selected),
                    size: AppDimensions.iconMedium,
                    color: selected ? AppColors.primary : colors.textMuted,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 2),
            // Label space is always reserved so items never reflow.
            SizedBox(
              height: 13,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 220),
                opacity: selected ? 1.0 : 0.0,
                child: Text(
                  destination.label,
                  style: AppTextStylesForNav.active.copyWith(color: colors.gold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

abstract final class AppTextStylesForNav {
  static const active = TextStyle(
    fontSize: 10.5,
    fontWeight: FontWeight.w700,
    letterSpacing: .2,
  );
}
