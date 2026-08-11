import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../auth/presentation/providers/auth_controller.dart';

/// Bridges the new Riverpod [AuthController.logout] to a simple callable
/// action so any screen (Profile, Settings, etc.) can trigger logout
/// without each one re-wiring the use case.
typedef LogoutAction = void Function(WidgetRef ref);

final logoutActionProvider = Provider<LogoutAction>((ref) {
  return (ref) {
    ref.read(authControllerProvider.notifier).logout();
  };
});
