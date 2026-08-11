import 'package:flutter/material.dart';
import '../theme/app_dimensions.dart';
import '../theme/app_text_styles.dart';
import '../theme/theme_colors.dart';

/// Student-friendly error display. Never surfaces raw exceptions/status
/// codes — just what happened and a way to retry.
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    required this.message,
    this.onRetry,
  });

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppDimensions.xl, horizontal: AppDimensions.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off_outlined, size: AppDimensions.iconXLarge, color: colors.textMuted),
          const SizedBox(height: AppDimensions.md),
          Text(
            message,
            textAlign: TextAlign.center,
            style: AppTextStyles.bodyMedium.copyWith(color: colors.textSecondary),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: AppDimensions.md),
            FilledButton.tonal(onPressed: onRetry, child: const Text('Retry')),
          ],
        ],
      ),
    );
  }
}
