import 'package:flutter/material.dart';
import '../theme/app_dimensions.dart';
import '../theme/app_text_styles.dart';
import '../theme/theme_colors.dart';

/// Reusable "nothing to show" state. Always explains what's missing and,
/// where useful, why — never a bare "No data".
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppDimensions.xl, horizontal: AppDimensions.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: AppDimensions.iconXLarge, color: colors.textMuted),
          const SizedBox(height: AppDimensions.md),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppTextStyles.titleLarge.copyWith(color: colors.textPrimary),
          ),
          const SizedBox(height: AppDimensions.xs),
          Text(
            message,
            textAlign: TextAlign.center,
            style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted),
          ),
          if (actionLabel != null) ...[
            const SizedBox(height: AppDimensions.md),
            OutlinedButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    );
  }
}
