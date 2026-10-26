import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/animations/entrance.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
import '../../../../core/widgets/depth.dart';
import '../../../../core/widgets/google_logo.dart';
import '../../../settings/presentation/providers/settings_controller.dart';
import '../providers/auth_controller.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _studentNumberController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _studentNumberController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    ref.read(authControllerProvider.notifier).clearError();
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    await ref
        .read(authControllerProvider.notifier)
        .login(_studentNumberController.text.trim(), _passwordController.text);
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final colors = ThemeColors.of(context);

    return Scaffold(
      backgroundColor: colors.backgroundSoft,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.all(AppDimensions.lg),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: IntrinsicHeight(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Spacer(),
                        Entrance(child: _BrandHeader(colors: colors)),
                        const SizedBox(height: AppDimensions.lg),
                        Entrance(
                          order: 1,
                          child: DepthCard(
                            padding: const EdgeInsets.all(AppDimensions.lg),
                            radius: AppDimensions.radiusLarge,
                            lift: 1.2,
                            child: _buildForm(authState, colors),
                          ),
                        ),
                        const SizedBox(height: AppDimensions.lg),
                        Entrance(
                          order: 2,
                          child: Text(
                            'Need help signing in? Contact the Registrar\'s Office.',
                            textAlign: TextAlign.center,
                            style: AppTextStyles.caption.copyWith(
                              color: colors.textMuted,
                            ),
                          ),
                        ),
                        const SizedBox(height: AppDimensions.sm),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildForm(AuthState authState, ThemeColors colors) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Welcome back',
            style: AppTextStyles.headlineSmall.copyWith(color: colors.textBold),
          ),
          const SizedBox(height: 2),
          Text(
            'Sign in to view your academic information.',
            style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted),
          ),
          const SizedBox(height: AppDimensions.lg),
          if (authState.errorMessage != null) ...[
            Entrance(child: _ErrorBanner(message: authState.errorMessage!, colors: colors)),
            const SizedBox(height: AppDimensions.md),
          ],
          Text(
            'Student number',
            style: AppTextStyles.labelLarge.copyWith(
              color: colors.textSecondary,
            ),
          ),
          const SizedBox(height: AppDimensions.xs),
          TextFormField(
            controller: _studentNumberController,
            style: TextStyle(
              color: colors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
            cursorColor: colors.primary,
            keyboardType: TextInputType.text,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.username],
            decoration: InputDecoration(
              hintText: 'Enter your student number',
              hintStyle: TextStyle(color: colors.textMuted),
              prefixIcon: Icon(Icons.badge_outlined, color: colors.textMuted),
            ),
            validator: (value) => value == null || value.trim().isEmpty
                ? 'Enter your student number.'
                : null,
          ),
          const SizedBox(height: AppDimensions.md),
          Text(
            'Password',
            style: AppTextStyles.labelLarge.copyWith(
              color: colors.textSecondary,
            ),
          ),
          const SizedBox(height: AppDimensions.xs),
          TextFormField(
            controller: _passwordController,
            style: TextStyle(
              color: colors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
            cursorColor: colors.primary,
            obscureText: _obscurePassword,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.password],
            decoration: InputDecoration(
              hintText: 'Enter your password',
              hintStyle: TextStyle(color: colors.textMuted),
              prefixIcon: Icon(Icons.lock_outline, color: colors.textMuted),
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: colors.textMuted,
                ),
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
              ),
            ),
            validator: (value) =>
                value == null || value.isEmpty ? 'Enter your password.' : null,
            onFieldSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: AppDimensions.lg),
          _gradientSignInButton(authState),
          const SizedBox(height: AppDimensions.md),
          _OrDivider(colors: colors),
          const SizedBox(height: AppDimensions.md),
          _googleSignInButton(authState, colors),
        ],
      ),
    );
  }

  /// Raised collegiate gold sign-in button matching the WCC theme.
  Widget _gradientSignInButton(AuthState authState) {
    const goldTop = Color(0xFFE5C378);
    const goldBottom = AppColors.gold; // Color(0xFFD6AF52)
    const navy = AppColors.primary;    // Color(0xFF07152F)

    return PressableScale(
      onTap: authState.isSubmitting ? null : _submit,
      pressScale: .97,
      child: Container(
        height: AppDimensions.buttonHeightLarge,
        decoration: BoxDecoration(
          color: goldBottom,
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [goldTop, goldBottom],
          ),
          borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
          border: Border.all(
            color: const Color(0xFFBE9332).withValues(alpha: .5),
            width: 1.2,
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.gold.withValues(alpha: .32),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
            onTap: authState.isSubmitting ? null : _submit,
            child: Center(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                child: authState.isSubmitting
                    ? const SizedBox(
                        key: ValueKey('spinner'),
                        width: AppDimensions.progressIndicatorSize,
                        height: AppDimensions.progressIndicatorSize,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: navy,
                        ),
                      )
                    : const Text(
                        'Sign in',
                        key: ValueKey('label'),
                        style: TextStyle(
                          fontSize: _buttonFontSize,
                          fontWeight: FontWeight.w800,
                          color: navy,
                          letterSpacing: 0.3,
                        ),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Google sign-in button. Same height, radius and label style as the
  /// primary button; surface-colored so text stays readable in light and dark.
  Widget _googleSignInButton(AuthState authState, ThemeColors colors) {
    Future<void> signIn() async {
      FocusScope.of(context).unfocus();
      final status =
          await ref.read(authControllerProvider.notifier).loginWithGoogle();
      if (!mounted) return;
      if (status == GoogleSignInStatus.fallbackRequired) {
        await _showGoogleEmailSignInDialog();
      }
    }

    return PressableScale(
      onTap: authState.isSubmitting ? null : signIn,
      pressScale: .97,
      child: Container(
        height: AppDimensions.buttonHeightLarge,
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
          border: Border.all(color: colors.border),
          boxShadow: [
            BoxShadow(
              color: AppColors.shadow.withValues(alpha: .12),
              blurRadius: 8,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
            onTap: authState.isSubmitting ? null : signIn,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const GoogleLogo(size: 22),
                const SizedBox(width: AppDimensions.sm + 2),
                Text(
                  'Sign in with Google',
                  style: TextStyle(
                    fontSize: _buttonFontSize,
                    fontWeight: FontWeight.w700,
                    color: colors.textBold,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showGoogleEmailSignInDialog() async {
    final savedEmail = ref.read(settingsControllerProvider).googleEmail;
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: .55),
      builder: (dialogContext) => _GoogleSignInDialog(
        initialEmail: savedEmail,
        onSubmit: (email) =>
            ref.read(authControllerProvider.notifier).loginWithGoogleEmail(email),
      ),
    );
  }
}

const double _buttonFontSize = 15;

class _OrDivider extends StatelessWidget {
  const _OrDivider({required this.colors});
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Divider(color: colors.divider, height: 1)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppDimensions.md),
          child: Text(
            'or',
            style: AppTextStyles.labelLarge.copyWith(color: colors.textMuted),
          ),
        ),
        Expanded(child: Divider(color: colors.divider, height: 1)),
      ],
    );
  }
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader({required this.colors});
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Soft-3D logo tile: gold gradient face, warm drop shadow, rim light.
        Container(
          width: 64,
          height: 64,
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.goldSoft, AppColors.goldLight],
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white.withValues(alpha: .55)),
            boxShadow: [
              BoxShadow(
                color: AppColors.goldLight.withValues(alpha: .4),
                blurRadius: 14,
                offset: const Offset(3, 6),
              ),
              BoxShadow(
                color: Colors.white.withValues(alpha: .5),
                blurRadius: 3,
                offset: const Offset(-2, -2),
              ),
            ],
          ),
          child: Image.asset(
            'assets/images/logo.png',
            fit: BoxFit.contain,
            errorBuilder: (context, error, stackTrace) =>
                Icon(Icons.school, color: AppColors.primary),
          ),
        ),
        const SizedBox(width: AppDimensions.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'WEST COAST COLLEGE',
                style: AppTextStyles.labelSmall.copyWith(
                  color: colors.gold,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.35,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                'WccPortal',
                style: AppTextStyles.headlineMedium.copyWith(
                  color: colors.textBold,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Student Portal',
                style: AppTextStyles.bodySmall.copyWith(
                  color: colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.colors});
  final String message;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppDimensions.sm),
      decoration: BoxDecoration(
        color: colors.error.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: colors.error.withValues(alpha: .25)),
      ),
      child: Row(
        children: [
          Icon(
            Icons.error_outline,
            color: colors.error,
            size: AppDimensions.iconMedium,
          ),
          const SizedBox(width: AppDimensions.sm),
          Expanded(
            child: Text(
              message,
              style: AppTextStyles.error.copyWith(color: colors.error),
            ),
          ),
        ],
      ),
    );
  }
}

class _GoogleSignInDialog extends StatefulWidget {
  const _GoogleSignInDialog({
    required this.initialEmail,
    required this.onSubmit,
  });

  final String initialEmail;
  final Future<String?> Function(String email) onSubmit;

  @override
  State<_GoogleSignInDialog> createState() => _GoogleSignInDialogState();
}

class _GoogleSignInDialogState extends State<_GoogleSignInDialog> {
  late final TextEditingController _emailController;
  String? _errorText;
  bool _submitting = false;

  static final RegExp _emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail);
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim().toLowerCase();
    if (email.isEmpty) {
      setState(() => _errorText = 'Enter your linked Google email address.');
      return;
    }
    if (!_emailRegex.hasMatch(email)) {
      setState(() => _errorText = 'Please enter a valid Google email address.');
      return;
    }

    setState(() {
      _submitting = true;
      _errorText = null;
    });

    final error = await widget.onSubmit(email);
    if (!mounted) return;

    if (error == null) {
      Navigator.of(context).pop();
    } else {
      setState(() {
        _submitting = false;
        _errorText = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(
        horizontal: AppDimensions.lg,
        vertical: AppDimensions.xl,
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: Container(
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: colors.border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: .28),
                blurRadius: 32,
                offset: const Offset(0, 16),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(
                  AppDimensions.lg,
                  AppDimensions.lg,
                  AppDimensions.md,
                  AppDimensions.md,
                ),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      colors.primary.withValues(alpha: .08),
                      colors.gold.withValues(alpha: .06),
                    ],
                  ),
                  border: Border(bottom: BorderSide(color: colors.divider)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: colors.surface,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: colors.border),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.shadow.withValues(alpha: .1),
                            blurRadius: 8,
                            offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: const Center(child: GoogleLogo(size: 22)),
                    ),
                    const SizedBox(width: AppDimensions.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Sign in with Google',
                            style: AppTextStyles.headlineSmall.copyWith(
                              color: colors.textBold,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Enter the Google email linked to your student account.',
                            style: AppTextStyles.bodySmall.copyWith(
                              color: colors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: _submitting
                          ? null
                          : () => Navigator.of(context).pop(),
                      icon: Icon(
                        Icons.close_rounded,
                        color: colors.textMuted,
                        size: 20,
                      ),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppDimensions.lg),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_errorText != null) ...[
                      _ErrorBanner(message: _errorText!, colors: colors),
                      const SizedBox(height: AppDimensions.md),
                    ],
                    Text(
                      'Google email',
                      style: AppTextStyles.labelLarge.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppDimensions.xs),
                    TextField(
                      controller: _emailController,
                      style: TextStyle(
                        color: colors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                      cursorColor: colors.primary,
                      enabled: !_submitting,
                      autofocus: true,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.email],
                      onChanged: (_) {
                        if (_errorText != null) {
                          setState(() => _errorText = null);
                        }
                      },
                      onSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        hintText: 'your.email@gmail.com',
                        hintStyle: TextStyle(color: colors.textMuted),
                        prefixIcon: Icon(Icons.alternate_email_rounded, color: colors.textMuted),
                      ),
                    ),
                    const SizedBox(height: AppDimensions.lg),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _submitting
                                ? null
                                : () => Navigator.of(context).pop(),
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size.fromHeight(46),
                              foregroundColor: colors.textSecondary,
                              side: BorderSide(color: colors.border),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(
                                  AppDimensions.radiusMedium,
                                ),
                              ),
                            ),
                            child: Text(
                              'Cancel',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: colors.textSecondary,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: AppDimensions.sm),
                        Expanded(
                          flex: 2,
                          child: FilledButton(
                            onPressed: _submitting ? null : _submit,
                            style: FilledButton.styleFrom(
                              minimumSize: const Size.fromHeight(46),
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(
                                  AppDimensions.radiusMedium,
                                ),
                              ),
                            ),
                            child: _submitting
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text(
                                    'Continue',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}