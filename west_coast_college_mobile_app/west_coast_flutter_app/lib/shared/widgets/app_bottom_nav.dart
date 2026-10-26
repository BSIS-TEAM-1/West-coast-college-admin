import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';
import '../../../core/theme/theme_colors.dart';

/// Modern, larger mobile bottom navigation bar with fluid spring animations,
/// a gliding active indicator, tactile press bounce, and an elevated pill chip.
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
  _Destination(
    path: '/dashboard',
    label: 'Home',
    icon: Icons.home_outlined,
    activeIcon: Icons.home,
  ),
  _Destination(
    path: '/schedule',
    label: 'Schedule',
    icon: Icons.calendar_today_outlined,
    activeIcon: Icons.calendar_today,
  ),
  _Destination(
    path: '/grades',
    label: 'Grades',
    icon: Icons.school_outlined,
    activeIcon: Icons.school,
  ),
  _Destination(
    path: '/announcements',
    label: 'Notif',
    icon: Icons.notifications_outlined,
    activeIcon: Icons.notifications,
  ),
  _Destination(
    path: '/profile',
    label: 'Profile',
    icon: Icons.person_outlined,
    activeIcon: Icons.person,
  ),
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
    final selectedIndex = _selectedIndex(currentPath);

    // Alignment from -1.0 (leftmost tab) to 1.0 (rightmost tab) for the gliding top bar.
    final alignmentX = _destinations.length > 1
        ? -1.0 + (2.0 * selectedIndex / (_destinations.length - 1))
        : 0.0;

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(
          top: BorderSide(
            color: isDark
                ? AppColors.goldLight.withValues(alpha: .16)
                : colors.border.withValues(alpha: .85),
            width: 1,
          ),
        ),
        boxShadow: [
          BoxShadow(
            color: isDark
                ? Colors.black.withValues(alpha: .6)
                : AppColors.primary.withValues(alpha: .08),
            blurRadius: 24,
            spreadRadius: 1,
            offset: const Offset(0, -8),
          ),
          BoxShadow(
            color: isDark
                ? Colors.black.withValues(alpha: .35)
                : AppColors.shadow.withValues(alpha: .05),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: AppDimensions.bottomNavHeight,
          child: Stack(
            children: [
              // Gliding top active indicator bar
              Positioned(
                top: 0,
                left: 8,
                right: 8,
                child: AnimatedAlign(
                  duration: const Duration(milliseconds: 380),
                  curve: Curves.easeOutBack,
                  alignment: Alignment(alignmentX, -1.0),
                  child: FractionallySizedBox(
                    widthFactor: 1 / _destinations.length,
                    child: Center(
                      child: Container(
                        width: 32,
                        height: 3.5,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppColors.gold, AppColors.goldLight],
                          ),
                          borderRadius: const BorderRadius.vertical(
                            bottom: Radius.circular(4),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.gold.withValues(
                                alpha: isDark ? .45 : .35,
                              ),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              // Navigation destinations row
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Row(
                  children: [
                    for (var i = 0; i < _destinations.length; i++)
                      Expanded(
                        child: _NavItem(
                          destination: _destinations[i],
                          selected: i == selectedIndex,
                          colors: colors,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatefulWidget {
  const _NavItem({
    required this.destination,
    required this.selected,
    required this.colors,
  });

  final _Destination destination;
  final bool selected;
  final ThemeColors colors;

  @override
  State<_NavItem> createState() => _NavItemState();
}

class _NavItemState extends State<_NavItem> {
  bool _pressed = false;

  void _handleTap() {
    HapticFeedback.selectionClick();
    context.go(widget.destination.path);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final selected = widget.selected;
    final colors = widget.colors;

    final activeLabelColor = isDark ? AppColors.goldLight : AppColors.primary;
    final inactiveLabelColor = colors.textMuted;

    return Semantics(
      button: true,
      selected: selected,
      label: widget.destination.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        onTap: _handleTap,
        child: AnimatedScale(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOutCubic,
          scale: _pressed ? 0.90 : 1.0,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Animated pill container with spring lift & gradient glow
              AnimatedContainer(
                duration: const Duration(milliseconds: 340),
                curve: Curves.easeOutBack,
                transform: Matrix4.translationValues(
                  0,
                  selected ? -2.0 : 0.0,
                  0,
                ),
                padding: EdgeInsets.symmetric(
                  horizontal: selected ? 16 : 10,
                  vertical: selected ? 7 : 5,
                ),
                decoration: BoxDecoration(
                  gradient: selected
                      ? const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [AppColors.goldSoft, AppColors.gold],
                        )
                      : null,
                  borderRadius: BorderRadius.circular(18),
                  border: selected
                      ? Border.all(
                          color: Colors.white.withValues(
                            alpha: isDark ? .28 : .65,
                          ),
                          width: 1,
                        )
                      : null,
                  boxShadow: selected
                      ? [
                          BoxShadow(
                            color: AppColors.gold.withValues(
                              alpha: isDark ? .32 : .38,
                            ),
                            blurRadius: 12,
                            spreadRadius: 0.5,
                            offset: const Offset(0, 4),
                          ),
                        ]
                      : const [],
                ),
                child: AnimatedScale(
                  duration: const Duration(milliseconds: 320),
                  curve: Curves.easeOutBack,
                  scale: selected ? 1.08 : 0.94,
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 240),
                    switchInCurve: Curves.easeOutBack,
                    switchOutCurve: Curves.easeIn,
                    transitionBuilder: (child, animation) {
                      return FadeTransition(
                        opacity: animation,
                        child: ScaleTransition(
                          scale: Tween<double>(begin: 0.75, end: 1.0)
                              .animate(animation),
                          child: child,
                        ),
                      );
                    },
                    child: Icon(
                      selected
                          ? widget.destination.activeIcon
                          : widget.destination.icon,
                      key: ValueKey(selected),
                      size: selected
                          ? AppDimensions.iconLarge
                          : AppDimensions.iconLarge - 2,
                      color: selected ? AppColors.primary : colors.textMuted,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 3),
              // Animated label with smooth color/weight transition
              AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 240),
                curve: Curves.easeOutCubic,
                style: (selected
                        ? AppTextStylesForNav.active
                        : AppTextStylesForNav.inactive)
                    .copyWith(
                  color: selected ? activeLabelColor : inactiveLabelColor,
                ),
                child: Text(
                  widget.destination.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

abstract final class AppTextStylesForNav {
  static const active = TextStyle(
    fontSize: 11.5,
    fontWeight: FontWeight.w700,
    letterSpacing: .2,
    height: 1.1,
  );

  static const inactive = TextStyle(
    fontSize: 11.0,
    fontWeight: FontWeight.w500,
    letterSpacing: .1,
    height: 1.1,
  );
}
