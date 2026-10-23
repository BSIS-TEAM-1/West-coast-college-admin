import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
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
                        _BrandHeader(colors: colors),
                        const SizedBox(height: AppDimensions.lg),
                        Container(
                          padding: const EdgeInsets.all(AppDimensions.lg),
                          decoration: BoxDecoration(
                            color: colors.surface,
                            borderRadius: BorderRadius.circular(
                              AppDimensions.radiusLarge,
                            ),
                            border: Border.all(color: colors.border),
                          ),
                          child: _buildForm(authState, colors),
                        ),
                        const SizedBox(height: AppDimensions.lg),
                        Text(
                          "Need help signing in? Contact the Registrar's Office.",
                          textAlign: TextAlign.center,
                          style: AppTextStyles.caption.copyWith(
                            color: colors.textMuted,
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
            _ErrorBanner(message: authState.errorMessage!, colors: colors),
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
            keyboardType: TextInputType.text,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.username],
            decoration: const InputDecoration(
              hintText: 'e.g. 202610140200',
              prefixIcon: Icon(Icons.badge_outlined),
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
            obscureText: _obscurePassword,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.password],
            decoration: InputDecoration(
              hintText: 'Enter your password',
              prefixIcon: const Icon(Icons.lock_outline),
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                ),
                onPressed: () =>
                    setState(() => _obscurePassword = !_obscurePassword),
              ),
            ),
            validator: (value) =>
                value == null || value.isEmpty ? 'Enter your password.' : null,
            onFieldSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: AppDimensions.lg),
          SizedBox(
            height: AppDimensions.buttonHeightLarge,
            child: FilledButton(
              onPressed: authState.isSubmitting ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: colors.primary,
                foregroundColor: colors.onPrimary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(
                    AppDimensions.radiusMedium,
                  ),
                ),
              ),
              child: authState.isSubmitting
                  ? const SizedBox(
                      width: AppDimensions.progressIndicatorSize,
                      height: AppDimensions.progressIndicatorSize,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Sign in',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
            ),
          ),
        ],
      ),
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
        Container(
          width: 56,
          height: 56,
          padding: const EdgeInsets.all(5),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
            border: Border.all(color: colors.border),
          ),
          child: Image.asset(
            'assets/images/logo.png',
            fit: BoxFit.contain,
            errorBuilder: (context, error, stackTrace) =>
                Icon(Icons.school, color: colors.primary),
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
                'Student Portal',
                style: AppTextStyles.headlineMedium.copyWith(
                  color: colors.textBold,
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
