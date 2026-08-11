import 'package:flutter/material.dart';
import '../theme/app_dimensions.dart';
import '../theme/app_text_styles.dart';
import '../theme/theme_colors.dart';

enum StatusTone { success, warning, danger, neutral, info }

/// Small pill used anywhere we show a status word (Enrolled, PASSED, TBA,
/// etc.). Always paired with text so meaning never depends on color alone.
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, required this.tone});

  final String label;
  final StatusTone tone;

  Color _color(ThemeColors colors) => switch (tone) {
        StatusTone.success => colors.success,
        StatusTone.warning => colors.warning,
        StatusTone.danger => colors.error,
        StatusTone.info => colors.primary,
        StatusTone.neutral => colors.textMuted,
      };

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    final color = _color(colors);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppDimensions.sm, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppDimensions.radiusSmall),
      ),
      child: Text(
        label,
        style: AppTextStyles.labelSmall.copyWith(color: color, fontWeight: FontWeight.w700),
      ),
    );
  }
}
