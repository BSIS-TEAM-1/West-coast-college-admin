import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimensions.dart';
import '../theme/theme_colors.dart';

/// Soft-3D ("light depth") primitives.
///
/// Everything here is pure Flutter: the 3D feel comes from gradients,
/// a top-light highlight shadow, and a drop key-light shadow — no external
/// 3D or shadow packages, no canvas-level shaders. All micro-interactions
/// use implicit animations, so widget cost stays low on low-end devices.

enum DepthTone { primary, gold, soft }

/// An icon sitting on a slightly "raised" tile: gradient face, a light
/// highlight on the top edge, and a soft drop shadow underneath.
class DepthIconTile extends StatelessWidget {
  const DepthIconTile({
    super.key,
    required this.icon,
    this.tone = DepthTone.gold,
    this.size = 48,
    this.iconSize,
    this.radius,
    this.onTap,
    this.tint,
  });

  final IconData icon;
  final DepthTone tone;
  final double size;
  final double? iconSize;
  final double? radius;
  final VoidCallback? onTap;
  /// Overrides the tone gradient with a single color-driven one.
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final (List<Color> gradient, Color highlight, Color face, Color iconColor) = tint != null
        ? (
            [tint!.withValues(alpha: .85), tint!],
            Colors.white.withValues(alpha: .45),
            isDark ? Colors.white.withValues(alpha: .06) : Colors.white,
            Colors.white,
          )
        : switch (tone) {
      DepthTone.primary => (
          const [AppColors.primaryHover, AppColors.primary],
          Colors.white.withValues(alpha: .28),
          isDark ? Colors.white.withValues(alpha: .06) : Colors.white,
          colors.onPrimary,
        ),
      DepthTone.gold => (
          const [AppColors.goldSoft, AppColors.goldLight],
          Colors.white.withValues(alpha: .55),
          isDark ? Colors.white.withValues(alpha: .06) : Colors.white,
          AppColors.primary,
        ),
      DepthTone.soft => (
          [colors.surface, colors.surfaceVariant],
          colors.border,
          isDark ? Colors.white.withValues(alpha: .05) : Colors.white,
          colors.textSecondary,
        ),
    };

    return PressableScale(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: gradient,
          ),
          borderRadius: BorderRadius.circular(radius ?? size * 0.32),
          border: Border.all(color: highlight, width: 1),
          boxShadow: [
            // Key light from above-left: shadow lands low-right.
            BoxShadow(
              color: isDark
                  ? Colors.black.withValues(alpha: .55)
                  : AppColors.shadow.withValues(alpha: .22),
              blurRadius: 12,
              offset: const Offset(3, 6),
            ),
            // Rim highlight: a faint light "bounce" on the opposite edge,
            // which reads as an edge-lit 3D chip.
            BoxShadow(
              color: isDark
                  ? Colors.white.withValues(alpha: .04)
                  : Colors.white.withValues(alpha: .5),
              blurRadius: 3,
              offset: const Offset(-2, -2),
            ),
          ],
        ),
        child: Icon(icon, size: iconSize ?? size * 0.52, color: iconColor),
      ),
    );
  }
}

/// Card face with the same soft-3D treatment: subtle vertical gradient,
/// thin top highlight, and two-layer shadow ("lifted but not glossy").
class DepthCard extends StatelessWidget {
  const DepthCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppDimensions.cardPadding),
    this.radius = AppDimensions.radiusMedium,
    this.onTap,
    this.lift = 1.0,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final VoidCallback? onTap;
  /// 0 = flat, 1 = default lift, >1 = taller drop shadow.
  final double lift;

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return PressableScale(
      onTap: onTap,
      child: Container(
        padding: padding,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [colors.surface, colors.surface.withValues(alpha: .92)],
          ),
          borderRadius: BorderRadius.circular(radius),
          border: Border.all(
            color: isDark ? colors.border : colors.border.withValues(alpha: .7),
          ),
          boxShadow: [
            BoxShadow(
              color: isDark
                  ? Colors.black.withValues(alpha: .45 * lift)
                  : AppColors.shadow.withValues(alpha: .10 * lift),
              blurRadius: 14,
              offset: const Offset(0, 5),
            ),
            BoxShadow(
              color: isDark
                  ? Colors.white.withValues(alpha: .03)
                  : Colors.white.withValues(alpha: .6),
              blurRadius: 2,
              offset: const Offset(0, -1),
            ),
          ],
        ),
        child: child,
      ),
    );
  }
}

/// Spring-y press micro-interaction. Scales down while touched and pops
/// back with `easeOutBack` on release — the lightest way to fake a
/// physical "dip" without an interaction controller.
class PressableScale extends StatefulWidget {
  const PressableScale({
    super.key,
    required this.child,
    this.onTap,
    this.pressScale = .94,
  });

  final Widget child;
  final VoidCallback? onTap;
  final double pressScale;

  @override
  State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: widget.onTap == null ? null : (_) => setState(() => _pressed = true),
      onTapUp: widget.onTap == null ? null : (_) => setState(() => _pressed = false),
      onTapCancel: widget.onTap == null ? null : () => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? widget.pressScale : 1.0,
        duration: const Duration(milliseconds: 130),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}
