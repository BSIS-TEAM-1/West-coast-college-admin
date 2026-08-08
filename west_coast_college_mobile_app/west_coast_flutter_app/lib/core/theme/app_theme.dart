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
      fontFamily: 'system-ui',
      appBarTheme: _buildAppBarTheme(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
      ),
      bottomNavigationBarTheme: _buildBottomNavTheme(
        selectedColor: AppColors.primary,
        backgroundColor: AppColors.surface,
        unselectedColor: AppColors.textMuted,
      ),
      cardTheme: _buildCardTheme(),
      elevatedButtonTheme: _buildElevatedButtonTheme(
        backgroundColor: AppColors.primaryDark,
        foregroundColor: AppColors.onPrimary,
      ),
      textButtonTheme: _buildTextButtonTheme(
        foregroundColor: AppColors.textBold,
        borderColor: AppColors.border,
      ),
      outlinedButtonTheme: _buildOutlinedButtonTheme(
        foregroundColor: AppColors.textBold,
        borderColor: AppColors.border,
      ),
      inputDecorationTheme: _buildInputDecorationTheme(
        fillColor: AppColors.surface.withOpacity(0.5),
        borderColor: AppColors.border,
        focusColor: AppColors.primary,
        errorColor: AppColors.error,
        textColor: AppColors.textPrimary,
        hintColor: AppColors.textMuted,
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
        seedColor: AppColors.primary,
        brightness: Brightness.dark,
      ),
      scaffoldBackgroundColor: const Color(0xFF121212),
      fontFamily: 'system-ui',
      appBarTheme: _buildAppBarTheme(
        backgroundColor: const Color(0xFF1E1E1E),
        foregroundColor: const Color(0xFFFFFFFF),
      ),
      bottomNavigationBarTheme: _buildBottomNavTheme(
        selectedColor: const Color(0xFFD4AF37),
        backgroundColor: const Color(0xFF1E1E1E),
        unselectedColor: const Color(0xFF999999),
      ),
      cardTheme: CardThemeData(
        elevation: AppDimensions.cardElevation,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
        ),
        color: const Color(0xFF1E1E1E),
      ),
      elevatedButtonTheme: _buildElevatedButtonTheme(
        backgroundColor: const Color(0xFFD4AF37),
        foregroundColor: AppColors.primary,
      ),
      textButtonTheme: _buildTextButtonTheme(
        foregroundColor: const Color(0xFFFFFFFF),
        borderColor: const Color(0xFF333333),
      ),
      outlinedButtonTheme: _buildOutlinedButtonTheme(
        foregroundColor: const Color(0xFFFFFFFF),
        borderColor: const Color(0xFF333333),
      ),
      inputDecorationTheme: _buildInputDecorationTheme(
        fillColor: const Color(0xFF2A2A2A),
        borderColor: const Color(0xFF333333),
        focusColor: const Color(0xFFD4AF37),
        errorColor: const Color(0xFFCF6679),
        textColor: const Color(0xFFFFFFFF),
        hintColor: const Color(0xFF999999),
      ),
      textTheme: TextTheme(
        displayLarge: AppTextStyles.displayLarge.copyWith(color: const Color(0xFFFFFFFF)),
        displayMedium: AppTextStyles.displayMedium.copyWith(color: const Color(0xFFFFFFFF)),
        displaySmall: AppTextStyles.displaySmall.copyWith(color: const Color(0xFFFFFFFF)),
        headlineLarge: AppTextStyles.headlineLarge.copyWith(color: const Color(0xFFFFFFFF)),
        headlineMedium: AppTextStyles.headlineMedium.copyWith(color: const Color(0xFFFFFFFF)),
        headlineSmall: AppTextStyles.headlineSmall.copyWith(color: const Color(0xFFFFFFFF)),
        titleLarge: AppTextStyles.titleLarge.copyWith(color: const Color(0xFFFFFFFF)),
        titleMedium: AppTextStyles.titleMedium.copyWith(color: const Color(0xFFFFFFFF)),
        titleSmall: AppTextStyles.titleSmall.copyWith(color: const Color(0xFFFFFFFF)),
        bodyLarge: AppTextStyles.bodyLarge.copyWith(color: const Color(0xFFFFFFFF)),
        bodyMedium: AppTextStyles.bodyMedium.copyWith(color: const Color(0xFFFFFFFF)),
        bodySmall: AppTextStyles.bodySmall.copyWith(color: const Color(0xFFBBBBBB)),
        labelLarge: AppTextStyles.labelLarge.copyWith(color: const Color(0xFFFFFFFF)),
        labelMedium: AppTextStyles.labelMedium.copyWith(color: const Color(0xFFFFFFFF)),
        labelSmall: AppTextStyles.labelSmall.copyWith(color: const Color(0xFFFFFFFF)),
      ),
      dividerTheme: const DividerThemeData(
        color: Color(0xFF333333),
        thickness: 1,
      ),
      iconTheme: const IconThemeData(
        color: Color(0xFFFFFFFF),
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
        contentTextStyle: AppTextStyles.bodyMedium.copyWith(color: const Color(0xFFFFFFFF)),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: ZoomPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }

  // Helper methods to reduce duplication
  static AppBarTheme _buildAppBarTheme({
    required Color backgroundColor,
    required Color foregroundColor,
  }) {
    return AppBarTheme(
      elevation: 0,
      centerTitle: true,
      backgroundColor: backgroundColor,
      foregroundColor: foregroundColor,
      titleTextStyle: AppTextStyles.headlineLarge.copyWith(color: foregroundColor),
      iconTheme: IconThemeData(color: foregroundColor, size: AppDimensions.iconMedium),
    );
  }

  static BottomNavigationBarThemeData _buildBottomNavTheme({
    required Color selectedColor,
    required Color backgroundColor,
    required Color unselectedColor,
  }) {
    return BottomNavigationBarThemeData(
      elevation: AppDimensions.elevationMedium,
      backgroundColor: backgroundColor,
      selectedItemColor: selectedColor,
      unselectedItemColor: unselectedColor,
      selectedLabelStyle: AppTextStyles.labelMedium,
      unselectedLabelStyle: AppTextStyles.labelMedium,
      type: BottomNavigationBarType.fixed,
    );
  }

  static CardThemeData _buildCardTheme() {
    return CardThemeData(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      color: AppColors.surface,
    );
  }

  static ElevatedButtonThemeData _buildElevatedButtonTheme({
    required Color backgroundColor,
    required Color foregroundColor,
  }) {
    return ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: backgroundColor,
        foregroundColor: foregroundColor,
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
    );
  }

  static TextButtonThemeData _buildTextButtonTheme({
    required Color foregroundColor,
    required Color borderColor,
  }) {
    return TextButtonThemeData(
      style: TextButton.styleFrom(
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: foregroundColor,
        padding: const EdgeInsets.symmetric(
          horizontal: AppDimensions.lg,
          vertical: AppDimensions.md,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimensions.buttonBorderRadius),
          side: BorderSide(color: borderColor),
        ),
        textStyle: AppTextStyles.button,
        minimumSize: const Size.fromHeight(AppDimensions.buttonHeight),
      ),
    );
  }

  static OutlinedButtonThemeData _buildOutlinedButtonTheme({
    required Color foregroundColor,
    required Color borderColor,
  }) {
    return OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: foregroundColor,
        padding: const EdgeInsets.symmetric(
          horizontal: AppDimensions.lg,
          vertical: AppDimensions.md,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimensions.buttonBorderRadius),
          side: BorderSide(color: borderColor),
        ),
        textStyle: AppTextStyles.button,
        minimumSize: const Size.fromHeight(AppDimensions.buttonHeight),
      ),
    );
  }

  static InputDecorationTheme _buildInputDecorationTheme({
    required Color fillColor,
    required Color borderColor,
    required Color focusColor,
    required Color errorColor,
    required Color textColor,
    required Color hintColor,
  }) {
    return InputDecorationTheme(
      filled: true,
      fillColor: fillColor,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppDimensions.md,
        vertical: AppDimensions.sm,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
        borderSide: BorderSide(color: borderColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
        borderSide: BorderSide(color: borderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
        borderSide: BorderSide(color: focusColor, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
        borderSide: BorderSide(color: errorColor, width: 2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppDimensions.inputBorderRadius),
        borderSide: BorderSide(color: errorColor, width: 2),
      ),
      labelStyle: AppTextStyles.labelMedium.copyWith(color: textColor),
      hintStyle: AppTextStyles.bodyMedium.copyWith(color: hintColor),
      errorStyle: AppTextStyles.error,
      floatingLabelStyle: AppTextStyles.labelMedium.copyWith(color: focusColor),
    );
  }
}