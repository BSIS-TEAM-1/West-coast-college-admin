import 'package:flutter/material.dart';
import 'app_colors.dart';
import 'app_text_styles.dart';
import 'app_dimensions.dart';

class AppTheme {
  // Light Theme (Matching Admin System)
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: AppColors.background,
      fontFamily: 'system-ui', // Admin: system-ui, Avenir, Helvetica, Arial, sans-serif
      appBarTheme: AppBarTheme(
        elevation: 0,
        centerTitle: true,
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        titleTextStyle: AppTextStyles.headlineLarge.copyWith(color: AppColors.onPrimary),
        iconTheme: const IconThemeData(color: AppColors.onPrimary, size: AppDimensions.iconMedium),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        elevation: AppDimensions.elevationMedium,
        backgroundColor: AppColors.surface,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textMuted,
        selectedLabelStyle: AppTextStyles.labelMedium,
        unselectedLabelStyle: AppTextStyles.labelMedium,
        type: BottomNavigationBarType.fixed,
      ),
      cardTheme: CardThemeData(
        elevation: AppDimensions.cardElevation,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
        ),
        color: AppColors.surface,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 0,
          backgroundColor: AppColors.primaryDark, // Admin: primary buttons use --color-primary-dark
          foregroundColor: AppColors.onPrimary,
          padding: const EdgeInsets.symmetric(
            horizontal: AppDimensions.lg,
            vertical: AppDimensions.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimensions.buttonBorderRadius),
          ),
          textStyle: AppTextStyles.button,
          minimumSize: const Size.fromHeight(AppDimensions.buttonHeight),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          elevation: 0,
          backgroundColor: AppColors.surface,
          foregroundColor: AppColors.textBold,
          padding: const EdgeInsets.symmetric(
            horizontal: AppDimensions.lg,
            vertical: AppDimensions.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimensions.buttonBorderRadius),
            side: const BorderSide(color: AppColors.border),
          ),
          textStyle: AppTextStyles.button,
          minimumSize: const Size.fromHeight(AppDimensions.buttonHeight),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          elevation: 0,
          backgroundColor: AppColors.surface,
          foregroundColor: AppColors.textBold,
          padding: const EdgeInsets.symmetric(
            horizontal: AppDimensions.lg,
            vertical: AppDimensions.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimensions.buttonBorderRadius),
            side: const BorderSide(color: AppColors.border),
          ),
          textStyle: AppTextStyles.button,
          minimumSize: const Size.fromHeight(AppDimensions.buttonHeight),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppDimensions.md,
          vertical: AppDimensions.sm,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
          borderSide: const BorderSide(color: AppColors.primarySubtle, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
          borderSide: const BorderSide(color: AppColors.error, width: 2),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
          borderSide: const BorderSide(color: AppColors.error, width: 2),
        ),
        labelStyle: AppTextStyles.labelMedium,
        hintStyle: AppTextStyles.bodyMedium.copyWith(color: AppColors.textMuted),
        errorStyle: AppTextStyles.error,
      ),
      textTheme: const TextTheme(
        displayLarge: AppTextStyles.displayLarge,
        displayMedium: AppTextStyles.displayMedium,
        displaySmall: AppTextStyles.displaySmall,
        headlineLarge: AppTextStyles.headlineLarge,
        headlineMedium: AppTextStyles.headlineMedium,
        headlineSmall: AppTextStyles.headlineSmall,
        titleLarge: AppTextStyles.titleLarge,
        titleMedium: AppTextStyles.titleMedium,
        titleSmall: AppTextStyles.titleSmall,
        bodyLarge: AppTextStyles.bodyLarge,
        bodyMedium: AppTextStyles.bodyMedium,
        bodySmall: AppTextStyles.bodySmall,
        labelLarge: AppTextStyles.labelLarge,
        labelMedium: AppTextStyles.labelMedium,
        labelSmall: AppTextStyles.labelSmall,
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
      ),
      iconTheme: const IconThemeData(
        color: AppColors.textPrimary,
        size: AppDimensions.iconMedium,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        elevation: AppDimensions.elevationMedium,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppDimensions.radiusRound)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        ),
        contentTextStyle: AppTextStyles.bodyMedium,
      ),
      // Match admin transition duration (320ms)
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: ZoomPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }

  // Dark Theme (Matching Admin System)
  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppDarkColors.primary,
        brightness: Brightness.dark,
      ),
      scaffoldBackgroundColor: AppDarkColors.background,
      fontFamily: 'system-ui', // Admin: system-ui, Avenir, Helvetica, Arial, sans-serif
      appBarTheme: AppBarTheme(
        elevation: 0,
        centerTitle: true,
        backgroundColor: AppDarkColors.primary,
        foregroundColor: AppDarkColors.onPrimary,
        titleTextStyle: AppTextStyles.headlineLarge.copyWith(color: AppDarkColors.onPrimary),
        iconTheme: const IconThemeData(color: AppDarkColors.onPrimary, size: AppDimensions.iconMedium),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        elevation: AppDimensions.elevationMedium,
        backgroundColor: AppDarkColors.surface,
        selectedItemColor: AppDarkColors.primary,
        unselectedItemColor: AppDarkColors.textMuted,
        selectedLabelStyle: AppTextStyles.labelMedium,
        unselectedLabelStyle: AppTextStyles.labelMedium,
        type: BottomNavigationBarType.fixed,
      ),
      cardTheme: CardThemeData(
        elevation: AppDimensions.cardElevation,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
        ),
        color: AppDarkColors.surface,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 0,
          backgroundColor: AppDarkColors.primaryDark,
          foregroundColor: AppDarkColors.onPrimary,
          padding: const EdgeInsets.symmetric(
            horizontal: AppDimensions.lg,
            vertical: AppDimensions.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimensions.buttonBorderRadius),
          ),
          textStyle: AppTextStyles.button,
          minimumSize: const Size.fromHeight(AppDimensions.buttonHeight),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          elevation: 0,
          backgroundColor: AppDarkColors.surface,
          foregroundColor: AppDarkColors.textBold,
          padding: const EdgeInsets.symmetric(
            horizontal: AppDimensions.lg,
            vertical: AppDimensions.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimensions.buttonBorderRadius),
            side: const BorderSide(color: AppDarkColors.border),
          ),
          textStyle: AppTextStyles.button,
          minimumSize: const Size.fromHeight(AppDimensions.buttonHeight),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          elevation: 0,
          backgroundColor: AppDarkColors.surface,
          foregroundColor: AppDarkColors.textBold,
          padding: const EdgeInsets.symmetric(
            horizontal: AppDimensions.lg,
            vertical: AppDimensions.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimensions.buttonBorderRadius),
            side: const BorderSide(color: AppDarkColors.border),
          ),
          textStyle: AppTextStyles.button,
          minimumSize: const Size.fromHeight(AppDimensions.buttonHeight),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppDarkColors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppDimensions.md,
          vertical: AppDimensions.sm,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
          borderSide: const BorderSide(color: AppDarkColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
          borderSide: const BorderSide(color: AppDarkColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
          borderSide: const BorderSide(color: AppDarkColors.primarySubtle, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
          borderSide: const BorderSide(color: AppDarkColors.error, width: 2),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
          borderSide: const BorderSide(color: AppDarkColors.error, width: 2),
        ),
        labelStyle: AppTextStyles.labelMedium.copyWith(color: AppDarkColors.textPrimary),
        hintStyle: AppTextStyles.bodyMedium.copyWith(color: AppDarkColors.textMuted),
        errorStyle: AppTextStyles.error,
      ),
      textTheme: TextTheme(
        displayLarge: AppTextStyles.displayLarge.copyWith(color: AppDarkColors.textPrimary),
        displayMedium: AppTextStyles.displayMedium.copyWith(color: AppDarkColors.textPrimary),
        displaySmall: AppTextStyles.displaySmall.copyWith(color: AppDarkColors.textPrimary),
        headlineLarge: AppTextStyles.headlineLarge.copyWith(color: AppDarkColors.textPrimary),
        headlineMedium: AppTextStyles.headlineMedium.copyWith(color: AppDarkColors.textPrimary),
        headlineSmall: AppTextStyles.headlineSmall.copyWith(color: AppDarkColors.textPrimary),
        titleLarge: AppTextStyles.titleLarge.copyWith(color: AppDarkColors.textPrimary),
        titleMedium: AppTextStyles.titleMedium.copyWith(color: AppDarkColors.textPrimary),
        titleSmall: AppTextStyles.titleSmall.copyWith(color: AppDarkColors.textPrimary),
        bodyLarge: AppTextStyles.bodyLarge.copyWith(color: AppDarkColors.textPrimary),
        bodyMedium: AppTextStyles.bodyMedium.copyWith(color: AppDarkColors.textPrimary),
        bodySmall: AppTextStyles.bodySmall.copyWith(color: AppDarkColors.textMuted),
        labelLarge: AppTextStyles.labelLarge.copyWith(color: AppDarkColors.textPrimary),
        labelMedium: AppTextStyles.labelMedium.copyWith(color: AppDarkColors.textPrimary),
        labelSmall: AppTextStyles.labelSmall.copyWith(color: AppDarkColors.textPrimary),
      ),
      dividerTheme: const DividerThemeData(
        color: AppDarkColors.border,
        thickness: 1,
      ),
      iconTheme: const IconThemeData(
        color: AppDarkColors.textPrimary,
        size: AppDimensions.iconMedium,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        elevation: AppDimensions.elevationMedium,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppDimensions.radiusRound)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        ),
        contentTextStyle: AppTextStyles.bodyMedium,
      ),
      // Match admin transition duration (320ms)
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: ZoomPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}