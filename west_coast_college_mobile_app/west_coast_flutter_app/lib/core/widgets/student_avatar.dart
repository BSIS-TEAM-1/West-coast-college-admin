import 'package:flutter/material.dart';
import '../theme/theme_colors.dart';

/// Circular initials avatar used wherever we represent "this student" —
/// dashboard header today, profile/settings later.
class StudentAvatar extends StatelessWidget {
  const StudentAvatar({super.key, required this.name, this.size = 56});

  final String name;
  final double size;

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: colors.primarySubtle, shape: BoxShape.circle),
      child: Text(
        _initials,
        style: TextStyle(
          fontSize: size * 0.36,
          fontWeight: FontWeight.w700,
          color: colors.primary,
        ),
      ),
    );
  }
}
