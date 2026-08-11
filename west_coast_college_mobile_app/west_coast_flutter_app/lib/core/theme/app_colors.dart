import 'package:flutter/material.dart';

class AppColors {
  // Primary Brand Colors — Matching the Landing Page (navy + gold)
  static const Color primary = Color(0xFF000A1E);       // Navy (Landing: --landing-primary)
  static const Color primaryHover = Color(0xFF002147);   // Navy container (Landing: --landing-primary-container)
  static const Color primaryDark = Color(0xFF000814);    // Darker navy
  static const Color primarySubtle = Color(0x1E000A1E);  // 12% opacity navy
  static const Color primaryContainer = Color(0xFF002147); // Navy container

  // Secondary Colors — Gold accent (Landing Page)
  static const Color secondary = Color(0xFF775A19);     // Gold (Landing: --landing-gold)
  static const Color accent = Color(0xFFE9C176);        // Gold Light (Landing: --landing-gold-light)
  static const Color gold = Color(0xFF775A19);          // Gold
  static const Color goldLight = Color(0xFFE9C176);     // Light Gold (Landing: --landing-gold-light)
  static const Color goldSoft = Color(0xFFFFDEA5);      // Gold Soft (Landing: --landing-gold-soft)
  
  // Status Colors (Matching Admin System)
  static const Color success = Color(0xFF16A34A);     // Green (Admin: --color-success)
  static const Color warning = Color(0xFFF59E0B);     // Amber (Admin: --color-warning)
  static const Color error = Color(0xFFEF4444);      // Red (Admin: --color-error)
  static const Color info = Color(0xFF4F46E5);       // Indigo (Admin: --color-info)
  static const Color maintenance = Color(0xFF8B5CF6);  // Purple (Admin: --color-maintenance)
  
  // Neutral Colors - Light Mode (Matching Landing Page)
  static const Color background = Color(0xFFFCF9F8);    // Off-white (Landing: --landing-bg)
  static const Color backgroundSoft = Color(0xFFF6F3F2); // Soft surface (Landing: --landing-surface-soft)
  static const Color surface = Color(0xFFFFFFFF);      // White (Landing: --landing-surface)
  static const Color surfaceHover = Color(0xFFEAE7E7); // Mid surface (Landing: --landing-surface-mid)
  static const Color surfaceVariant = Color(0xFFF6F3F2); // Soft surface
  static const Color surfaceSoft = Color(0xFFF6F3F2);  // Soft surface for input backgrounds

  // Text Colors - Light Mode (Matching Landing Page)
  static const Color textPrimary = Color(0xFF1C1B1B);   // Near-black (Landing: --landing-text)
  static const Color textMuted = Color(0xFF5F6269);     // Muted (Landing: --landing-muted)
  static const Color textBold = Color(0xFF000A1E);      // Navy bold (Landing: --landing-primary)
  static const Color textSecondary = Color(0xFF5F6269);  // Muted (Landing: --landing-muted)
  static const Color textTertiary = Color(0xFF9CA3AF);  // Light Gray
  static const Color textDisabled = Color(0xFF9CA3AF);  // Light Gray

  // Border Colors (Matching Landing Page)
  static const Color border = Color(0xFFC4C6CF);       // Landing: --landing-border
  static const Color sidebarBorder = Color(0x6B775A19); // Gold-tinted border
  
  // Additional Colors
  static const Color divider = Color(0xFFE5E7EB);     // Light Gray
  static const Color overlay = Color(0x80000000);      // Semi-transparent black
  static const Color overlayLight = Color(0x40000000); // Lighter overlay
  
  // Shadow Colors
  static const Color shadow = Color(0x1A000000);       // Subtle shadow
  static const Color shadowMedium = Color(0x33000000); // Medium shadow
  static const Color shadowHeavy = Color(0x4D000000);  // Heavy shadow
  
  // On Colors
  static const Color onPrimary = Color(0xFFFFFFFF);    // White on navy
  static const Color onSurface = Color(0xFF000A1E);    // Navy on surface
  static const Color onDarkSurface = Color(0xFFE9C176); // Gold on dark surface

  // Gradient Colors — Navy hero gradient (Landing Page hero)
  static const List<Color> primaryGradient = [
    Color(0xFF000A1E),  // Navy
    Color(0xFF002147),  // Navy container
    Color(0xFF192A47),  // Lighter navy
  ];

  static const List<Color> secondaryGradient = [
    Color(0xFF775A19),  // Gold
    Color(0xFFE9C176),  // Gold light
  ];
  
  // Dark Mode Colors (use these with Theme.of(context).brightness)
  static const Color darkBackground = Color(0xFF121212);      // Dark background
  static const Color darkSurface = Color(0xFF1E1E1E);         // Dark surface
  static const Color darkTextPrimary = Color(0xFFF8FAFC);     // Light text
  static const Color darkTextMuted = Color(0xFF94A3B8);       // Muted light text
  static const Color darkBorder = Color(0x2EFFFFFF);          // 18% opacity white
  static const Color darkError = Color(0xFFF87171);           // Lighter red for dark mode
}