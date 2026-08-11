import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../providers/auth_controller.dart';

/// Shown for the brief moment the app checks Secure Storage for a valid
/// session (see spec section 6). The router redirects away from here as
/// soon as [AuthState.status] settles.
class AppSplashPage extends ConsumerWidget {
  const AppSplashPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isChecking = ref.watch(authControllerProvider).status == AuthStatus.checking;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(AppDimensions.radiusLarge),
              ),
              child: const Icon(Icons.school, size: 56, color: AppColors.onPrimary),
            ),
            const SizedBox(height: AppDimensions.lg),
            Text('WCConnect', style: AppTextStyles.headlineLarge.copyWith(color: AppColors.textBold)),
            const SizedBox(height: AppDimensions.xs),
            Text(
              'Your Academic Journey, One Tap Away',
              style: AppTextStyles.bodyMedium.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: AppDimensions.xl),
            if (isChecking)
              const CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2.4),
          ],
        ),
      ),
    );
  }
}
