import 'package:flutter/material.dart';
import 'app_colors.dart';

class AppTextStyles {
  // Display (Admin doesn't use display sizes, but keeping for compatibility)
  static const TextStyle displayLarge = TextStyle(
    fontSize: 57,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.25,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle displayMedium = TextStyle(
    fontSize: 45,
    fontWeight: FontWeight.w400,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle displaySmall = TextStyle(
    fontSize: 36,
    fontWeight: FontWeight.w400,
    color: AppColors.textPrimary,
  );
  
  // Headline (Matching Admin System)
  static const TextStyle headlineLarge = TextStyle(
    fontSize: 28,    // clamp(1.75rem, 2vw, 1.55rem) ≈ 28px
    fontWeight: FontWeight.w700, // Bold (700)
    color: AppColors.textPrimary,
    height: 1.18, // Line-height: 1.18
  );
  
  static const TextStyle headlineMedium = TextStyle(
    fontSize: 18.9,  // 1.18rem ≈ 18.9px
    fontWeight: FontWeight.w700, // Bold (700)
    color: AppColors.textPrimary,
    height: 1.2,  // Line-height: 1.2
  );
  
  static const TextStyle headlineSmall = TextStyle(
    fontSize: 17.3,  // 1.08rem ≈ 17.3px
    fontWeight: FontWeight.w700, // Bold (700)
    color: AppColors.textPrimary,
    height: 1.2,  // Line-height: 1.2
  );
  
  // Title (Admin doesn't have specific title sizes, using body sizes)
  static const TextStyle titleLarge = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w500,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle titleMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle titleSmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: AppColors.textPrimary,
  );
  
  // Body (Matching Admin System: 0.875rem = 14px, line-height: 1.45)
  static const TextStyle bodyLarge = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.45,
    letterSpacing: 0,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.45,
    letterSpacing: 0,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle bodySmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.45,
    letterSpacing: 0,
    color: AppColors.textMuted,
  );
  
  // Label (Matching Admin System eyebrow/kicker: 0.74rem ≈ 11.8px)
  static const TextStyle labelLarge = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle labelMedium = TextStyle(
    fontSize: 11.8,  // 0.74rem
    fontWeight: FontWeight.w500,
    letterSpacing: 0.04, // 0.04em
    color: AppColors.textPrimary,
  );
  
  static const TextStyle labelSmall = TextStyle(
    fontSize: 11.8,  // 0.74rem
    fontWeight: FontWeight.w500,
    letterSpacing: 0.04, // 0.04em
    color: AppColors.textPrimary,
  );
  
  // Button (Matching Admin System: font-weight: 500)
  static const TextStyle button = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: AppColors.onPrimary,
  );
  
  // Caption (Matching Admin System small text)
  static const TextStyle caption = TextStyle(
    fontSize: 11.8,  // 0.74rem
    fontWeight: FontWeight.w400,
    height: 1.2,
    letterSpacing: 0.04,
    color: AppColors.textMuted,
  );
  
  // Overline
  static const TextStyle overline = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.w400,
    letterSpacing: 1.5,
    color: AppColors.textMuted,
  );
  
  // Custom Styles
  static const TextStyle error = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: AppColors.error,
  );
  
  static const TextStyle success = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: AppColors.success,
  );
  
  static const TextStyle warning = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: AppColors.warning,
  );
  
  static const TextStyle link = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500, // Admin: font-weight: 500
    color: AppColors.primary,
    decoration: TextDecoration.none, // Admin: text-decoration: inherit
  );
  
  static const TextStyle muted = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: AppColors.textMuted,
  );
  
  static const TextStyle code = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    fontFamily: 'monospace',
    color: AppColors.textPrimary,
  );
}