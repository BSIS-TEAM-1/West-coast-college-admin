import 'package:flutter/material.dart';
import '../theme/app_text_styles.dart';
import '../theme/theme_colors.dart';

/// Consistent section title used across every feature (Dashboard, Grades,
/// Schedule, etc.) so the app reads as one coherent product rather than a
/// stack of differently-styled screens.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Text(title, style: AppTextStyles.headlineSmall.copyWith(color: colors.textBold)),
        ),
        if (actionLabel != null)
          // Small navy pill with a gold chevron — a real, tappable button
          // that still reads as a restrained highlight.
          DecoratedBox(
            decoration: BoxDecoration(
              color: colors.primarySubtle,
              borderRadius: BorderRadius.circular(999),
            ),
            child: InkWell(
              onTap: onAction,
              borderRadius: BorderRadius.circular(999),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      actionLabel!,
                      style: AppTextStyles.labelSmall.copyWith(
                        color: colors.textBold,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(Icons.arrow_forward_ios_rounded, size: 10, color: colors.gold),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
