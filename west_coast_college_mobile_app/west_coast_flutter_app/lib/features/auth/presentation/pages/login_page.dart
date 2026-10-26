import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/animations/entrance.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
import '../../../../core/widgets/depth.dart';
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
          _googleSignInButton(authState),
        ],
      ),
    );
  }

  /// Raised gradient sign-in button with a press "dip" (PressableScale).
  Widget _gradientSignInButton(AuthState authState) {
    return PressableScale(
      onTap: authState.isSubmitting ? null : _submit,
      pressScale: .97,
      child: Ink(
        height: AppDimensions.buttonHeightLarge,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.primaryHover, AppColors.primary],
          ),
          borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
          border: Border.all(color: Colors.white.withValues(alpha: .1)),
          boxShadow: [
            BoxShadow(
              color: AppColors.shadow.withValues(alpha: .3),
              blurRadius: 12,
              offset: const Offset(0, 5),
            ),
            BoxShadow(
              color: Colors.white.withValues(alpha: .05),
              blurRadius: 2,
              offset: const Offset(-2, -2),
            ),
          ],
        ),
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
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Sign in',
                      key: ValueKey('label'),
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }

  /// Google sign-in button.
  Widget _googleSignInButton(AuthState authState) {
    return PressableScale(
      onTap: authState.isSubmitting ? null : () => ref.read(authControllerProvider.notifier).loginWithGoogle(),
      pressScale: .97,
      child: Container(
        height: AppDimensions.buttonHeightLarge,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: .1),
          borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
          border: Border.all(color: Colors.white.withValues(alpha: .2)),
          boxShadow: [
            BoxShadow(
              color: AppColors.shadow.withValues(alpha: .2),
              blurRadius: 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
          onTap: authState.isSubmitting ? null : () => ref.read(authControllerProvider.notifier).loginWithGoogle(),
          child: Padding(
            padding: const EdgeInsets.all(AppDimensions.md),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Image.asset(
                  'assets/images/google_logo.png',
                  width: 28,
                  height: 28,
                  errorBuilder: (context, error, stackTrace) => const Icon(Icons.g_mobiledata, size: 28, color: Colors.red),
                ),
                const SizedBox(width: AppDimensions.sm),
                const Text(
                  'Sign in with Google',
                  style: TextStyle(
                    color: Colors.black87,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
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