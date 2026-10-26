import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to profile',
          onPressed: () => context.go('/profile'),
        ),
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
          const SizedBox(height: AppDimensions.md),
          _SectionCard(
            title: 'Login',
            colors: colors,
            children: [
              _SettingTile(
                icon: Icons.email_outlined,
                label: 'Make Google Email Primary',
                value: state.googleEmail.isNotEmpty ? 'Set' : 'Not set',
                onTap: () => _showSetGoogleEmailDialog(context, ref, state.googleEmail, colors),
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
      barrierColor: Colors.black.withValues(alpha: .55),
      builder: (dialogContext) {
        void choose(ThemeMode mode) {
          ref.read(settingsControllerProvider.notifier).setThemeMode(mode);
          Navigator.pop(dialogContext);
        }

        return _ModernDialog(
          colors: colors,
          icon: Icons.palette_outlined,
          title: 'Choose Theme',
          subtitle: 'Pick how the app looks on your device.',
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _ThemeOption(
                label: 'Light',
                description: 'Bright and clean',
                icon: Icons.light_mode_rounded,
                selected: current == ThemeMode.light,
                onTap: () => choose(ThemeMode.light),
                colors: colors,
              ),
              const SizedBox(height: AppDimensions.sm),
              _ThemeOption(
                label: 'Dark',
                description: 'Easy on the eyes',
                icon: Icons.dark_mode_rounded,
                selected: current == ThemeMode.dark,
                onTap: () => choose(ThemeMode.dark),
                colors: colors,
              ),
              const SizedBox(height: AppDimensions.sm),
              _ThemeOption(
                label: 'System',
                description: 'Match device settings',
                icon: Icons.brightness_auto_rounded,
                selected: current == ThemeMode.system,
                onTap: () => choose(ThemeMode.system),
                colors: colors,
              ),
            ],
          ),
        );
      },
    );
  }

  void _showSetGoogleEmailDialog(BuildContext context, WidgetRef ref, String currentEmail, ThemeColors colors) {
    final emailController = TextEditingController(text: currentEmail);
    final formKey = GlobalKey<FormState>();
    final emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

    showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: .55),
      builder: (dialogContext) {
        var saving = false;
        // While an email is linked, it can't be changed or re-set; the user
        // must unlink first.
        var linked = currentEmail.isNotEmpty;

        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> save() async {
              if (linked) return;
              if (!(formKey.currentState?.validate() ?? false)) return;
              final email = emailController.text.trim();
              setDialogState(() => saving = true);
              final success = await ref.read(settingsControllerProvider.notifier).setGoogleEmail(email);
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (context.mounted) {
                _showToast(
                  context,
                  colors,
                  success ? 'Google email set successfully.' : 'Failed to save Google email to server.',
                  success: success,
                );
              }
            }

            Future<void> unlink() async {
              setDialogState(() => saving = true);
              final success = await ref.read(settingsControllerProvider.notifier).unlinkGoogleEmail();
              if (!context.mounted) return;
              // Stay open so the user can immediately link a different email.
              setDialogState(() {
                saving = false;
                if (success) {
                  linked = false;
                  emailController.clear();
                }
              });
              _showToast(
                context,
                colors,
                success ? 'Google email unlinked. You can now set a new one.' : 'Failed to unlink Google email from server.',
                success: success,
              );
            }

            return _ModernDialog(
              colors: colors,
              icon: Icons.alternate_email_rounded,
              title: 'Google Sign-In',
              subtitle: 'Link your Google account to sign in faster.',
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (linked) ...[
                      _LinkedBadge(email: emailController.text, colors: colors),
                      const SizedBox(height: AppDimensions.md),
                    ],
                    Text(
                      'Google email address',
                      style: AppTextStyles.bodyMedium.copyWith(
                        color: colors.textBold,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: emailController,
                      keyboardType: TextInputType.emailAddress,
                      autofocus: !linked,
                      enabled: !saving && !linked,
                      autovalidateMode: AutovalidateMode.onUserInteraction,
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => save(),
                      style: AppTextStyles.bodyMedium.copyWith(color: colors.textPrimary),
                      decoration: _fieldDecoration(colors, hint: 'name@gmail.com'),
                      validator: (value) {
                        final trimmed = (value ?? '').trim();
                        if (trimmed.isEmpty) return 'Please enter your Google email.';
                        if (!emailRegex.hasMatch(trimmed)) return 'Please enter a valid email address.';
                        return null;
                      },
                    ),
                    if (linked) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Unlink this email first if you want to use a different one.',
                        style: TextStyle(fontSize: 12, color: colors.textMuted),
                      ),
                    ],
                    const SizedBox(height: AppDimensions.md),
                    _PrimaryButton(
                      colors: colors,
                      label: linked ? 'Linked as Primary' : 'Set as Primary',
                      icon: linked ? Icons.lock_outline_rounded : Icons.check_rounded,
                      loading: saving && !linked,
                      onPressed: (saving || linked) ? null : save,
                    ),
                    const SizedBox(height: AppDimensions.sm),
                    Row(
                      children: [
                        Expanded(
                          child: _GhostButton(
                            label: linked ? 'Close' : 'Cancel',
                            color: colors.textMuted,
                            onPressed: saving ? null : () => Navigator.pop(dialogContext),
                          ),
                        ),
                        if (linked)
                          Expanded(
                            child: _GhostButton(
                              label: 'Unlink',
                              icon: Icons.link_off_rounded,
                              color: colors.error,
                              onPressed: saving ? null : unlink,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  InputDecoration _fieldDecoration(ThemeColors colors, {required String hint}) {
    OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: color, width: width),
        );

    return InputDecoration(
      hintText: hint,
      hintStyle: AppTextStyles.bodyMedium.copyWith(color: colors.textMuted),
      prefixIcon: Icon(Icons.mail_outline_rounded, size: 20, color: colors.textMuted),
      filled: true,
      fillColor: colors.surfaceVariant.withValues(alpha: .6),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: border(colors.border),
      enabledBorder: border(colors.border),
      focusedBorder: border(colors.primary, 1.6),
      errorBorder: border(colors.error),
      focusedErrorBorder: border(colors.error, 1.6),
      errorStyle: TextStyle(color: colors.error, fontSize: 12),
    );
  }

  void _showToast(BuildContext context, ThemeColors colors, String message, {required bool success}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: success ? colors.success : colors.error,
          margin: const EdgeInsets.all(AppDimensions.md),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          content: Row(
            children: [
              Icon(
                success ? Icons.check_circle_rounded : Icons.error_rounded,
                color: Colors.white,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(message, style: const TextStyle(color: Colors.white))),
            ],
          ),
        ),
      );
  }
}

/// Popup card shell shared by the settings dialogs: soft gradient header with
/// an icon badge, rounded corners, shadow and a gentle scale-in animation.
class _ModernDialog extends StatelessWidget {
  const _ModernDialog({
    required this.colors,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.child,
  });
  final ThemeColors colors;
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.92, end: 1),
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutBack,
      builder: (context, scale, content) => Transform.scale(scale: scale, child: content),
      child: Dialog(
        backgroundColor: Colors.transparent,
        elevation: 0,
        insetPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Container(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: colors.border.withValues(alpha: .7)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: .28),
                  blurRadius: 40,
                  offset: const Offset(0, 18),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.fromLTRB(22, 26, 22, 20),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          colors.primary.withValues(alpha: .16),
                          colors.primary.withValues(alpha: .03),
                        ],
                      ),
                    ),
                    child: Column(
                      children: [
                        Container(
                          width: 60,
                          height: 60,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [colors.primary, colors.primary.withValues(alpha: .75)],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: colors.primary.withValues(alpha: .35),
                                blurRadius: 18,
                                offset: const Offset(0, 8),
                              ),
                            ],
                          ),
                          child: Icon(icon, color: colors.onPrimary, size: 28),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          title,
                          textAlign: TextAlign.center,
                          style: AppTextStyles.headlineSmall.copyWith(
                            color: colors.textBold,
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          subtitle,
                          textAlign: TextAlign.center,
                          style: AppTextStyles.bodyMedium.copyWith(
                            color: colors.textMuted,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(22, 18, 22, 20),
                    child: child,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LinkedBadge extends StatelessWidget {
  const _LinkedBadge({required this.email, required this.colors});
  final String email;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: colors.success.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.success.withValues(alpha: .3)),
      ),
      child: Row(
        children: [
          Icon(Icons.verified_rounded, size: 20, color: colors.success),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Currently linked',
                  style: TextStyle(fontSize: 11, color: colors.textMuted, fontWeight: FontWeight.w600),
                ),
                Text(
                  email,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13.5, color: colors.textBold, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    required this.colors,
    required this.label,
    required this.icon,
    required this.onPressed,
    this.loading = false,
  });
  final ThemeColors colors;
  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: onPressed == null && !loading ? .6 : 1,
      child: Container(
        height: 50,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [colors.primary, colors.primary.withValues(alpha: .8)],
          ),
          boxShadow: [
            BoxShadow(
              color: colors.primary.withValues(alpha: .3),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onPressed,
            child: Center(
              child: loading
                  ? SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: colors.onPrimary),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(icon, size: 20, color: colors.onPrimary),
                        const SizedBox(width: 8),
                        Text(
                          label,
                          style: TextStyle(
                            color: colors.onPrimary,
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GhostButton extends StatelessWidget {
  const _GhostButton({required this.label, required this.color, required this.onPressed, this.icon});
  final String label;
  final Color color;
  final IconData? icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: color,
        padding: const EdgeInsets.symmetric(vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 6)],
          Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
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
            if (onTap != null)...[
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
    required this.description,
    required this.icon,
    required this.selected,
    required this.onTap,
    required this.colors,
  });
  final String label;
  final String description;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      decoration: BoxDecoration(
        color: selected ? colors.primary.withValues(alpha: .1) : colors.surfaceVariant.withValues(alpha: .5),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: selected ? colors.primary : colors.border,
          width: selected ? 1.6 : 1,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: selected ? colors.primary : colors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: selected ? null : Border.all(color: colors.border),
                  ),
                  child: Icon(icon, size: 20, color: selected ? colors.onPrimary : colors.textMuted),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w700,
                          color: colors.textBold,
                        ),
                      ),
                      Text(
                        description,
                        style: TextStyle(fontSize: 12, color: colors.textMuted),
                      ),
                    ],
                  ),
                ),
                AnimatedScale(
                  scale: selected ? 1 : 0,
                  duration: const Duration(milliseconds: 180),
                  child: Icon(Icons.check_circle_rounded, color: colors.primary, size: 22),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
