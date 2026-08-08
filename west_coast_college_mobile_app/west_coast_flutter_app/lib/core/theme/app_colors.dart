import 'package:flutter/material.dart';

class AppColors {
  // Primary Brand Colors (Light Mode - Matching Admin System)
  static const Color primary = Color(0xFF4F46E5);      // Indigo (Admin: --theme-accent-base)
  static const Color primaryHover = Color(0xFF4338CA); // Darker Indigo (Admin: --color-primary-hover)
  static const Color primaryDark = Color(0xFF3730A3);  // Even Darker Indigo (Admin: --color-primary-dark)
  static const Color primarySubtle = Color(0x1E4F46E5); // 12% opacity (Admin: --color-primary-subtle)
  static const Color primaryContainer = Color(0xFF3F3EF7); // Light Indigo container
  
  // Secondary Colors
  static const Color secondary = Color(0xFF10B981);    // Green
  static const Color accent = Color(0xFFF59E0B);      // Amber
  static const Color gold = Color(0xFFD4AF37);         // Gold
  static const Color goldLight = Color(0xFFE6C757);    // Light Gold
  
  // Status Colors (Matching Admin System)
  static const Color success = Color(0xFF16A34A);     // Green (Admin: --color-success)
  static const Color warning = Color(0xFFF59E0B);     // Amber (Admin: --color-warning)
  static const Color error = Color(0xFFEF4444);      // Red (Admin: --color-error)
  static const Color info = Color(0xFF4F46E5);       // Indigo (Admin: --color-info)
  static const Color maintenance = Color(0xFF8B5CF6);  // Purple (Admin: --color-maintenance)
  
  // Neutral Colors - Light Mode (Matching Admin System)
  static const Color background = Color(0xFFFFFFFF);   // White (Admin: --color-bg)
  static const Color backgroundSoft = Color(0xFFFAFAFA); // Light Gray (Admin: --color-bg-soft)
  static const Color surface = Color(0xFFFFFFFF);     // White (Admin: --color-surface)
  static const Color surfaceHover = Color(0x02000000); // 2% opacity black (Admin: --color-surface-hover)
  static const Color surfaceVariant = Color(0xFFF3F4F6); // Medium Gray
  static const Color surfaceSoft = Color(0xFFFAFAFA);  // Light gray for input backgrounds
  
  // Text Colors - Light Mode (Matching Admin System)
  static const Color textPrimary = Color(0xFF1F2937);   // Dark Gray (Admin: --color-text)
  static const Color textMuted = Color(0xFF6B7280);     // Medium Gray (Admin: --color-text-muted)
  static const Color textBold = Color(0xFF111827);      // Almost Black (Admin: --color-text-bold)
  static const Color textSecondary = Color(0xFF4B5563);  // Dark Gray (Admin: --color-text-secondary)
  static const Color textTertiary = Color(0xFF9CA3AF);  // Light Gray
  static const Color textDisabled = Color(0xFF9CA3AF);  // Light Gray
  
  // Border Colors (Matching Admin System)
  static const Color border = Color(0xFFE5E7EB);       // Light Gray (Admin: --color-border)
  static const Color sidebarBorder = Color(0x6B4F46E5); // 42% opacity (Admin: --color-sidebar-border)
  
  // Additional Colors
  static const Color divider = Color(0xFFE5E7EB);     // Light Gray
  static const Color overlay = Color(0x80000000);      // Semi-transparent black
  static const Color overlayLight = Color(0x40000000); // Lighter overlay
  
  // Shadow Colors
  static const Color shadow = Color(0x1A000000);       // Subtle shadow
  static const Color shadowMedium = Color(0x33000000); // Medium shadow
  static const Color shadowHeavy = Color(0x4D000000);  // Heavy shadow
  
  // On Colors
  static const Color onPrimary = Color(0xFFFFFFFF);    // White (Admin: --color-on-primary)
  static const Color onSurface = Color(0xFF4F46E5);    // Indigo (Admin: --color-primary-on-surface)
  static const Color onDarkSurface = Color(0x7A4F46E5); // 48% opacity (Admin: --color-primary-on-dark-surface)
  
  // Gradient Colors
  static const List<Color> primaryGradient = [
    Color(0xFF4F46E5),
    Color(0xFF4338CA),
  ];
  
  static const List<Color> secondaryGradient = [
    secondary,
    Color(0xFF34D399),
  ];
  
  // Dark Mode Colors (use these with Theme.of(context).brightness)
  static const Color darkBackground = Color(0xFF121212);      // Dark background
  static const Color darkSurface = Color(0xFF1E1E1E);         // Dark surface
  static const Color darkTextPrimary = Color(0xFFF8FAFC);     // Light text
  static const Color darkTextMuted = Color(0xFF94A3B8);       // Muted light text
  static const Color darkBorder = Color(0x2EFFFFFF);          // 18% opacity white
  static const Color darkError = Color(0xFFF87171);           // Lighter red for dark mode
}