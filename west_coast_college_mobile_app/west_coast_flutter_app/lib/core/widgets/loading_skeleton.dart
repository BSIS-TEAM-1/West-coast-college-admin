import 'package:flutter/material.dart';
import '../theme/app_dimensions.dart';
import '../theme/theme_colors.dart';

/// A single pulsing placeholder block. Compose several of these to build a
/// screen-shaped skeleton so content doesn't jump around while it loads.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height = 16,
    this.borderRadius = AppDimensions.radiusSmall,
  });

  final double? width;
  final double height;
  final double borderRadius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  late final Animation<double> _opacity = Tween<double>(begin: 0.4, end: 0.9).animate(
    CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    return AnimatedBuilder(
      animation: _opacity,
      builder: (context, child) => Opacity(
        opacity: _opacity.value,
        child: Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: colors.surfaceVariant,
            borderRadius: BorderRadius.circular(widget.borderRadius),
          ),
        ),
      ),
    );
  }
}

/// Skeleton shaped like the dashboard so the layout stays stable while data
/// loads (header card + a couple of list-style sections).
class DashboardSkeleton extends StatelessWidget {
  const DashboardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppDimensions.md),
      children: [
        Row(
          children: [
            const SkeletonBox(width: 56, height: 56, borderRadius: AppDimensions.radiusRound),
            const SizedBox(width: AppDimensions.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  SkeletonBox(width: 160, height: 18),
                  SizedBox(height: AppDimensions.xs),
                  SkeletonBox(width: 120, height: 14),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppDimensions.lg),
        const SkeletonBox(width: 140, height: 16),
        const SizedBox(height: AppDimensions.sm),
        const SkeletonBox(height: 72),
        const SizedBox(height: AppDimensions.lg),
        const SkeletonBox(width: 140, height: 16),
        const SizedBox(height: AppDimensions.sm),
        const SkeletonBox(height: 56),
        const SizedBox(height: AppDimensions.sm),
        const SkeletonBox(height: 56),
      ],
    );
  }
}
