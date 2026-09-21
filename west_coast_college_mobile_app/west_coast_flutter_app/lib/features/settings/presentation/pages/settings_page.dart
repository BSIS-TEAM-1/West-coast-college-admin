import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
import '../providers/settings_controller.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = ThemeColors.of(context);
    final state = ref.watch(settingsControllerProvider);

    return Scaffold(
      backgroundColor: colors.backgroundSoft,
      appBar: AppBar(
        title: const Text('Settings'),
        backgroundColor: colors.primary,
        foregroundColor: colors.onPrimary,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppDimensions.md),
        children: [
          _SectionCard(
            title: 'Appearance',
            colors: colors,
            children: [
              _SettingTile(
                icon: Icons.brightness_6_outlined,
                label: 'Theme',
                value: _themeLabel(state.themeMode),
                onTap: () => _showThemeDialog(context, ref, state.themeMode, colors),
                colors: colors,
              ),
            ],
          ),
          const SizedBox(height: AppDimensions.md),
          _SectionCard(
            title: 'About',
            colors: colors,
            children: [
              _SettingTile(
                icon: Icons.info_outline,
                label: 'App Version',
                value: '1.0.0',
                onTap: null,
                colors: colors,
              ),
            ],
          ),
          const SizedBox(height: AppDimensions.xl),
        ],
      ),
    );
  }

  String _themeLabel(ThemeMode mode) {
    switch (mode) {
      case ThemeMode.light:
        return 'Light';
      case ThemeMode.dark:
        return 'Dark';
      case ThemeMode.system:
        return 'System';
    }
  }

  void _showThemeDialog(BuildContext context, WidgetRef ref, ThemeMode current, ThemeColors colors) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Select Theme'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _ThemeOption(
              label: 'Light',
              icon: Icons.light_mode_outlined,
              selected: current == ThemeMode.light,
              onTap: () {
                ref.read(settingsControllerProvider.notifier).setThemeMode(ThemeMode.light);
                Navigator.pop(dialogContext);
              },
              colors: colors,
            ),
            _ThemeOption(
              label: 'Dark',
              icon: Icons.dark_mode_outlined,
              selected: current == ThemeMode.dark,
              onTap: () {
                ref.read(settingsControllerProvider.notifier).setThemeMode(ThemeMode.dark);
                Navigator.pop(dialogContext);
              },
              colors: colors,
            ),
            _ThemeOption(
              label: 'System',
              icon: Icons.brightness_auto_outlined,
              selected: current == ThemeMode.system,
              onTap: () {
                ref.read(settingsControllerProvider.notifier).setThemeMode(ThemeMode.system);
                Navigator.pop(dialogContext);
              },
              colors: colors,
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.colors, required this.children});
  final String title;
  final ThemeColors colors;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppDimensions.md, AppDimensions.md, AppDimensions.md, AppDimensions.sm),
            child: Text(title, style: AppTextStyles.headlineSmall.copyWith(fontSize: 15, color: colors.textBold)),
          ),
          Divider(height: 1, color: colors.divider),
          ...children,
        ],
      ),
    );
  }
}

class _SettingTile extends StatelessWidget {
  const _SettingTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
    required this.colors,
  });
  final IconData icon;
  final String label;
  final String value;
  final VoidCallback? onTap;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppDimensions.md, vertical: AppDimensions.sm),
        child: Row(
          children: [
            Icon(icon, size: 20, color: colors.textMuted),
            const SizedBox(width: AppDimensions.md),
            Expanded(
              child: Text(label, style: AppTextStyles.bodyMedium.copyWith(color: colors.textPrimary)),
            ),
            Text(value, style: AppTextStyles.bodyMedium.copyWith(color: colors.textMuted)),
            if (onTap != null) ...[
              const SizedBox(width: AppDimensions.sm),
              Icon(Icons.chevron_right, size: 18, color: colors.textMuted),
            ],
          ],
        ),
      ),
    );
  }
}

class _ThemeOption extends StatelessWidget {
  const _ThemeOption({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    required this.colors,
  });
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon),
      title: Text(label),
      trailing: selected ? Icon(Icons.check, color: colors.primary) : null,
      onTap: onTap,
      selected: selected,
    );
  }
}
