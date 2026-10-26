import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../providers/auth_controller.dart';

/// The WccPortal loading screen: navy canvas, centered branding with a gentle
/// entrance, the complete West Coast College logo (cap, monogram, book and
/// its baked-in WccPortal wordmark) floating on the canvas, a restrained
/// glint along the college brand line, and a thin gold loader.
///
/// It is shown only while [AuthController] is restoring the session from
/// Secure Storage — there is no artificial delay. The moment initialization
/// settles, the router redirects to `/dashboard` or `/login` (the recovery
/// path when a session cannot be restored), so the animation runs for exactly
/// as long as real initialization is in progress.
class AppSplashPage extends ConsumerWidget {
  const AppSplashPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isChecking =
        ref.watch(authControllerProvider).status == AuthStatus.checking;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.primary,
        systemNavigationBarDividerColor: Colors.transparent,
      ),
      child: Scaffold(
        backgroundColor: AppColors.primary,
        body: _SplashBody(isChecking: isChecking),
      ),
    );
  }
}

class _SplashBody extends StatefulWidget {
  const _SplashBody({required this.isChecking});

  final bool isChecking;

  @override
  State<_SplashBody> createState() => _SplashBodyState();
}

class _SplashBodyState extends State<_SplashBody>
    with TickerProviderStateMixin {
  /// Two small controllers, both disposed with the page:
  ///  - `_entrance` runs ONCE: fade + scale (90% → 100%) for the branding.
  ///  - `_loop` repeats for the two ambient effects (logo bob and the
  ///    shimmer glint) so the screen stays alive while initialization runs.
  /// Everything driven by them is cheap (opacity/transform/one gradient per
  /// frame) and this page is transient, so the repeating cost never applies
  /// to the main app experience.
  late final AnimationController _entrance;
  late final AnimationController _loop;
  late final Animation<double> _entranceCurve;

  @override
  void initState() {
    super.initState();
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
      value: 0,
    );
    _entranceCurve = CurveTween(
      curve: Curves.easeOutCubic,
    ).animate(_entrance);
    _loop = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
      value: 0,
    );
    _entrance.forward();
    _loop.repeat();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Reduced motion: settle both controllers on their final values so the
    // layout is identical but nothing moves (and no frames are scheduled).
    // Checked here — MediaQuery reads are not allowed in initState — and it
    // re-evaluates if the user toggles the OS setting while the page is up.
    final reducedMotion = MediaQuery.of(context).disableAnimations;
    if (reducedMotion && _loop.isAnimating) {
      _entrance.stop();
      _entrance.value = 1;
      _loop.stop();
      _loop.value = 0;
    }
  }

  @override
  void dispose() {
    _entrance.dispose();
    _loop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Quiet background detail: wide, very-low-opacity academic rings so
        // the navy canvas reads as branded rather than empty. Static — no
        // blur, no particles, no per-frame cost.
        const _SplashBackdrop(),
        Center(
          child: _SplashContent(
            entrance: _entranceCurve,
            loop: _loop,
            isChecking: widget.isChecking,
          ),
        ),
      ],
    );
  }
}

/// Oversized, very-low-opacity rings behind the branding. Painted once.
class _SplashBackdrop extends StatelessWidget {
  const _SplashBackdrop();

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return IgnorePointer(
      child: CustomPaint(
        size: size,
        painter: _SplashPainter(),
      ),
    );
  }
}

class _SplashPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width * 0.5, size.height * 0.42);
    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    for (var i = 0; i < 3; i++) {
      ringPaint.color = AppColors.goldLight.withValues(alpha: .06 - (i * .012));
      canvas.drawCircle(center, 120.0 + (i * 54), ringPaint);
    }
    final dotPaint = Paint()
      ..style = PaintingStyle.fill
      ..color = AppColors.goldSoft.withValues(alpha: .10);
    canvas.drawCircle(
      Offset(size.width * 0.82, size.height * 0.24),
      5,
      dotPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _SplashPainter oldDelegate) => false;
}

class _SplashContent extends StatelessWidget {
  const _SplashContent({
    required this.entrance,
    required this.loop,
    required this.isChecking,
  });

  final Animation<double> entrance;
  final Animation<double> loop;
  final bool isChecking;

  @override
  Widget build(BuildContext context) {
    // Entrance is declarative: opacity + scale(0.9 → 1.0) in one pass.
    return FadeTransition(
      opacity: entrance,
      child: ScaleTransition(
        scale: Tween<double>(begin: .90, end: 1.0)
            .chain(CurveTween(curve: Curves.easeOutCubic))
            .animate(entrance),
        child: AnimatedBuilder(
          animation: loop,
          builder: (context, _) {
            // Sinusoidal bob is seamless every cycle (unlike an
            // Interval-curved slide, which would jump on repeat).
            final bob = math.sin(loop.value * 2 * math.pi);
            final shimmer = loop.value;
            return Transform.translate(
              offset: Offset(0, bob * 5.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 1. The complete college logo — emblem and its own baked-in
                  //    WccPortal wordmark — never clipped or cropped.
                  const _AppLogo(),
                  const SizedBox(height: AppDimensions.sm),
                  // 2. College branding line, with a subtle passing glint.
                  _ShimmerBrand(progress: shimmer),
                  const SizedBox(height: AppDimensions.xs),
                  // 3. Tagline under the brand lockup.
                  Text(
                    'Your Academic Journey, One Tap Away',
                    textAlign: TextAlign.center,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: Colors.white.withValues(alpha: .62),
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xl),
                  // 4. Thin gold loader while the session is restored.
                  _GoldLoader(visible: isChecking),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// The complete West Coast College logo: the cap/monogram/book emblem AND its
/// baked-in "WccPortal" wordmark, rendered un-clipped at the asset's native
/// aspect ratio (BoxFit.contain, no ClipRect/ClipRRect/overflow window).
///
/// The asset is square with generous transparent margins, so a square box
/// letterboxes it exactly — every stage of the entrance scale (0.90 → 1.0)
/// and the ±5px bob stays inside the box, and nothing above or below the
/// artwork is ever cut off.
class _AppLogo extends StatelessWidget {
  const _AppLogo();

  @override
  Widget build(BuildContext context) {
    // Responsive sizing — a fraction of the shortest screen side, clamped so
    // the mark keeps its presence on large screens and never dominates small
    // ones. Deliberately not a fixed pixel size.
    final shortestSide = MediaQuery.sizeOf(context).shortestSide;
    final logoSize = (shortestSide * 0.52).clamp(140.0, 220.0).toDouble();

    return Semantics(
      label: 'WccPortal logo',
      container: true,
      child: SizedBox(
        width: logoSize,
        height: logoSize,
        child: Image.asset(
          'assets/images/Wcc-Icon.png',
          // contain, never cover: cover against a shorter box is exactly what
          // cropped the wordmark out of the lower portion before.
          fit: BoxFit.contain,
          errorBuilder: (context, error, stackTrace) => const Icon(
            Icons.school_rounded,
            size: 44,
            color: AppColors.goldLight,
          ),
        ),
      ),
    );
  }
}

/// "WEST COAST COLLEGE" branding line. A narrow, near-white glint sweeps
/// across the letters each cycle — one cheap gradient build per frame on a
/// transient screen, over static text.
class _ShimmerBrand extends StatelessWidget {
  const _ShimmerBrand({required this.progress});

  final double progress;

  @override
  Widget build(BuildContext context) {
    final brand = Text(
      'WEST COAST COLLEGE',
      style: AppTextStyles.labelSmall.copyWith(
        color: AppColors.goldLight,
        fontWeight: FontWeight.w800,
        letterSpacing: 2.4,
      ),
    );

    // Continuously sweep the glint from fully left to fully right; the band
    // is narrow so the effect stays subtle.
    final sweep = -1.6 + (3.2 * progress);
    return ShaderMask(
      blendMode: BlendMode.srcATop,
      shaderCallback: (bounds) => const LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [Colors.transparent, Colors.white, Colors.transparent],
        stops: [0.34, 0.50, 0.66],
      ).createShader(
        Rect.fromLTWH(bounds.width * sweep, 0, bounds.width, bounds.height),
      ),
      child: brand,
    );
  }
}

/// Thin, restrained gold loading indicator — shown only while the session is
/// being restored.
class _GoldLoader extends StatelessWidget {
  const _GoldLoader({required this.visible});

  final bool visible;

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: visible ? 1.0 : 0.0,
      duration: const Duration(milliseconds: 240),
      child: Semantics(
        label: 'Restoring your session',
        child: SizedBox(
          width: 148,
          height: 3,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: visible ? null : 0,
              minHeight: 3,
              backgroundColor: Colors.white.withValues(alpha: .16),
              valueColor: const AlwaysStoppedAnimation<Color>(
                AppColors.goldLight,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
