import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Theme-aware color access. Instead of hardcoding `AppColors.surface`
/// (which is always white) throughout the new pages, use
/// `ThemeColors.of(context).surface` so dark mode gets the right surface
/// tone. Keeps the existing [AppColors] constants as the light-mode source
/// of truth.
class ThemeColors extends ThemeExtension<ThemeColors> {
  final Color background;
  final Color backgroundSoft;
  final Color surface;
  final Color surfaceVariant;
  final Color border;
  final Color divider;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color textBold;
  final Color primary;
  final Color primarySubtle;
  final Color onPrimary;
  final Color success;
  final Color warning;
  final Color error;

  const ThemeColors({
    required this.background,
    required this.backgroundSoft,
    required this.surface,
    required this.surfaceVariant,
    required this.border,
    required this.divider,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.textBold,
    required this.primary,
    required this.primarySubtle,
    required this.onPrimary,
    required this.success,
    required this.warning,
    required this.error,
  });

  static const light = ThemeColors(
    background: AppColors.background,
    backgroundSoft: AppColors.backgroundSoft,
    surface: AppColors.surface,
    surfaceVariant: AppColors.surfaceVariant,
    border: AppColors.border,
    divider: AppColors.divider,
    textPrimary: AppColors.textPrimary,
    textSecondary: AppColors.textSecondary,
    textMuted: AppColors.textMuted,
    textBold: AppColors.textBold,
    primary: AppColors.primary,
    primarySubtle: AppColors.primarySubtle,
    onPrimary: AppColors.onPrimary,
    success: AppColors.success,
    warning: AppColors.warning,
    error: AppColors.error,
  );

  static const dark = ThemeColors(
    background: AppColors.darkBackground,
    backgroundSoft: Color(0xFF161616),
    surface: AppColors.darkSurface,
    surfaceVariant: Color(0xFF2A2A2A),
    border: AppColors.darkBorder,
    divider: AppColors.darkBorder,
    textPrimary: AppColors.darkTextPrimary,
    textSecondary: Color(0xFFCBD5E1),
    textMuted: AppColors.darkTextMuted,
    textBold: AppColors.darkTextPrimary,
    primary: AppColors.primary,
    primarySubtle: Color(0x2E4F46E5),
    onPrimary: AppColors.onPrimary,
    success: AppColors.success,
    warning: AppColors.warning,
    error: AppColors.darkError,
  );

  static ThemeColors of(BuildContext context) {
    final extension = Theme.of(context).extension<ThemeColors>();
    if (extension != null) return extension;
    return Theme.of(context).brightness == Brightness.dark ? dark : light;
  }

  @override
  ThemeColors copyWith({
    Color? background,
    Color? backgroundSoft,
    Color? surface,
    Color? surfaceVariant,
    Color? border,
    Color? divider,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? textBold,
    Color? primary,
    Color? primarySubtle,
    Color? onPrimary,
    Color? success,
    Color? warning,
    Color? error,
  }) {
    return ThemeColors(
      background: background ?? this.background,
      backgroundSoft: backgroundSoft ?? this.backgroundSoft,
      surface: surface ?? this.surface,
      surfaceVariant: surfaceVariant ?? this.surfaceVariant,
      border: border ?? this.border,
      divider: divider ?? this.divider,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      textBold: textBold ?? this.textBold,
      primary: primary ?? this.primary,
      primarySubtle: primarySubtle ?? this.primarySubtle,
      onPrimary: onPrimary ?? this.onPrimary,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      error: error ?? this.error,
    );
  }

  @override
  ThemeColors lerp(ThemeExtension<ThemeColors>? other, double t) {
    if (other is! ThemeColors) return this;
    return ThemeColors(
      background: Color.lerp(background, other.background, t)!,
      backgroundSoft: Color.lerp(backgroundSoft, other.backgroundSoft, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceVariant: Color.lerp(surfaceVariant, other.surfaceVariant, t)!,
      border: Color.lerp(border, other.border, t)!,
      divider: Color.lerp(divider, other.divider, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      textBold: Color.lerp(textBold, other.textBold, t)!,
      primary: Color.lerp(primary, other.primary, t)!,
      primarySubtle: Color.lerp(primarySubtle, other.primarySubtle, t)!,
      onPrimary: Color.lerp(onPrimary, other.onPrimary, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      error: Color.lerp(error, other.error, t)!,
    );
  }
}
