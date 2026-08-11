import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
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
    await ref.read(authControllerProvider.notifier).login(
          _studentNumberController.text.trim(),
          _passwordController.text,
        );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);

    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: AppDimensions.lg),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: IntrinsicHeight(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Spacer(flex: 2),
                      _buildBrandHeader(),
                      const SizedBox(height: AppDimensions.xl),
                      _buildForm(authState),
                      const Spacer(flex: 3),
                      _buildFooter(),
                      const SizedBox(height: AppDimensions.md),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  /// Hero-style header matching the landing page: dark navy gradient
  /// background with the WCC logo and gold-accented title.
  Widget _buildBrandHeader() {
    return Column(
      children: [
        // Logo image
        ClipRRect(
          borderRadius: BorderRadius.circular(AppDimensions.radiusLarge),
          child: Image.asset(
            'assets/images/logo.png',
            width: 88,
            height: 88,
            fit: BoxFit.contain,
            errorBuilder: (context, error, stackTrace) => Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(AppDimensions.radiusLarge),
              ),
              child: const Icon(Icons.school, size: 44, color: AppColors.onPrimary),
            ),
          ),
        ),
        const SizedBox(height: AppDimensions.md),
        // Title in navy
        Text(
          'WCConnect',
          style: AppTextStyles.headlineLarge.copyWith(
            color: AppColors.primary,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: AppDimensions.xs),
        // Kicker in gold (landing page style)
        Text(
          'WEST COAST COLLEGE',
          textAlign: TextAlign.center,
          style: AppTextStyles.labelSmall.copyWith(
            color: AppColors.gold,
            fontWeight: FontWeight.w900,
            letterSpacing: 2.0,
          ),
        ),
        const SizedBox(height: AppDimensions.xs),
        Text(
          'Official Student Portal',
          textAlign: TextAlign.center,
          style: AppTextStyles.bodySmall.copyWith(color: AppColors.textMuted),
        ),
      ],
    );
  }

  Widget _buildForm(AuthState authState) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (authState.errorMessage != null) ...[
            _buildErrorBanner(authState.errorMessage!),
            const SizedBox(height: AppDimensions.md),
          ],
          Text('Student Number', style: AppTextStyles.labelLarge.copyWith(color: AppColors.textSecondary)),
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
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return 'Enter your student number.';
              }
              return null;
            },
          ),
          const SizedBox(height: AppDimensions.md),
          Text('Password', style: AppTextStyles.labelLarge.copyWith(color: AppColors.textSecondary)),
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
                icon: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
              ),
            ),
            validator: (value) {
              if (value == null || value.isEmpty) {
                return 'Enter your password.';
              }
              return null;
            },
            onFieldSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: AppDimensions.lg),
          // Gold button matching the landing page's .landing-gold-btn
          SizedBox(
            height: AppDimensions.buttonHeightLarge,
            child: FilledButton(
              onPressed: authState.isSubmitting ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.gold,
                foregroundColor: Colors.white,
                disabledBackgroundColor: AppColors.gold.withValues(alpha: 0.6),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(2)),
              ),
              child: authState.isSubmitting
                  ? const SizedBox(
                      width: AppDimensions.progressIndicatorSize,
                      height: AppDimensions.progressIndicatorSize,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                    )
                  : const Text(
                      'LOG IN',
                      style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorBanner(String message) {
    return Container(
      padding: const EdgeInsets.all(AppDimensions.sm),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: AppColors.error.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppColors.error, size: AppDimensions.iconMedium),
          const SizedBox(width: AppDimensions.sm),
          Expanded(child: Text(message, style: AppTextStyles.error)),
        ],
      ),
    );
  }

  Widget _buildFooter() {
    return Text(
      "Having trouble logging in? Contact the Registrar's Office.",
      textAlign: TextAlign.center,
      style: AppTextStyles.caption,
    );
  }
}
