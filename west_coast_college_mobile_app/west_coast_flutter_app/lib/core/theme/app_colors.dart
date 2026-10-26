import 'package:flutter/material.dart';

class AppColors {
  // Primary Brand Colors — navy blue (requested palette #07152F / #142B50)
  static const Color primary = Color(0xFF07152F);       // Primary navy blue
  static const Color primaryHover = Color(0xFF142B50);   // Secondary navy blue
  static const Color primaryDark = Color(0xFF050F24);    // Darker navy (pressed surfaces)
  static const Color primarySubtle = Color(0x1E07152F);  // 12% opacity navy
  static const Color primaryContainer = Color(0xFF142B50); // Navy container

  // Secondary Colors — gold accent (requested palette #D6AF52 / #F3E6BE)
  static const Color secondary = Color(0xFFD6AF52);     // Gold accent
  static const Color accent = Color(0xFFF3E6BE);        // Light gold
  static const Color gold = Color(0xFFD6AF52);          // Gold accent
  static const Color goldLight = Color(0xFFF3E6BE);     // Light gold
  static const Color goldSoft = Color(0xFFF6E9C8);      // Gold soft (gradient start)

  // Status Colors (Matching Admin System)
  static const Color success = Color(0xFF16A34A);     // Green (Admin: --color-success)
  static const Color warning = Color(0xFFF59E0B);     // Amber (Admin: --color-warning)
  static const Color error = Color(0xFFEF4444);      // Red (Admin: --color-error)
  static const Color info = Color(0xFF4F46E5);       // Indigo (Admin: --color-info)
  static const Color maintenance = Color(0xFF8B5CF6);  // Purple (Admin: --color-maintenance)

  // Neutral Colors - Light Mode (requested palette)
  static const Color background = Color(0xFFF7F7F9);    // Main background
  static const Color backgroundSoft = Color(0xFFF7F7F9); // Soft screen background
  static const Color surface = Color(0xFFFFFFFF);      // White cards
  static const Color surfaceHover = Color(0xFFEFF1F4); // Mid surface hover
  static const Color surfaceVariant = Color(0xFFEFF1F4); // Soft surface
  static const Color surfaceSoft = Color(0xFFEFF1F4);  // Soft surface for input backgrounds

  // Text Colors - Light Mode (requested palette #101828 / #667085)
  static const Color textPrimary = Color(0xFF101828);   // Primary text
  static const Color textMuted = Color(0xFF667085);     // Secondary text
  static const Color textBold = Color(0xFF07152F);      // Navy bold
  static const Color textSecondary = Color(0xFF667085); // Secondary text
  static const Color textTertiary = Color(0xFF98A2B3);  // Tertiary gray
  static const Color textDisabled = Color(0xFF98A2B3);  // Light gray

  // Border Colors (requested palette #D9DCE3)
  static const Color border = Color(0xFFD9DCE3);       // Card borders
  static const Color sidebarBorder = Color(0x6BD6AF52); // Gold-tinted border
  
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

  // Gradient Colors — navy hero gradient
  static const List<Color> primaryGradient = [
    Color(0xFF142B50),  // Secondary navy
    Color(0xFF07152F),  // Primary navy
  ];

  static const List<Color> secondaryGradient = [
    Color(0xFFD6AF52),  // Gold
    Color(0xFFF3E6BE),  // Light gold
  ];
  
  // Dark Mode Colors (use these with Theme.of(context).brightness)
  static const Color darkBackground = Color(0xFF121212);      // Dark background
  static const Color darkSurface = Color(0xFF1E1E1E);         // Dark surface
  static const Color darkTextPrimary = Color(0xFFF8FAFC);     // Light text
  static const Color darkTextMuted = Color(0xFF94A3B8);       // Muted light text
  static const Color darkBorder = Color(0x2EFFFFFF);          // 18% opacity white
  static const Color darkError = Color(0xFFF87171);           // Lighter red for dark mode
  static const Color darkSuccess = Color(0xFF4ADE80);         // Lighter green for dark mode
}