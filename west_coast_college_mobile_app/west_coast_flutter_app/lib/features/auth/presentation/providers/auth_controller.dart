import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/errors/failure.dart';
import '../../domain/entities/student_entity.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../domain/usecases/login_usecase.dart';
import '../../domain/usecases/logout_usecase.dart';
import '../../domain/usecases/restore_session_usecase.dart';
import 'auth_providers.dart';

enum AuthStatus { checking, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final StudentEntity? student;
  final String? errorMessage;
  final bool isSubmitting;

  const AuthState({
    this.status = AuthStatus.checking,
    this.student,
    this.errorMessage,
    this.isSubmitting = false,
  });

  bool get isAuthenticated => status == AuthStatus.authenticated;

  AuthState copyWith({
    AuthStatus? status,
    StudentEntity? student,
    String? errorMessage,
    bool clearError = false,
    bool? isSubmitting,
  }) {
    return AuthState(
      status: status ?? this.status,
      student: student ?? this.student,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      isSubmitting: isSubmitting ?? this.isSubmitting,
    );
  }
}

/// Owns the app-wide session: restoring it on launch, logging in, logging
/// out. The router listens to [AuthState.status] to decide where to send
/// the student.
class AuthController extends StateNotifier<AuthState> {
  final LoginUseCase _loginUseCase;
  final LogoutUseCase _logoutUseCase;
  final RestoreSessionUseCase _restoreSessionUseCase;

  AuthController({
    required LoginUseCase loginUseCase,
    required LogoutUseCase logoutUseCase,
    required RestoreSessionUseCase restoreSessionUseCase,
  })  : _loginUseCase = loginUseCase,
        _logoutUseCase = logoutUseCase,
        _restoreSessionUseCase = restoreSessionUseCase,
        super(const AuthState()) {
    restoreSession();
  }

  Future<void> restoreSession() async {
    state = state.copyWith(status: AuthStatus.checking);
    final result = await _restoreSessionUseCase();

    if (result == null) {
      state = state.copyWith(status: AuthStatus.unauthenticated);
      return;
    }

    switch (result) {
      case AuthSuccess<StudentEntity>(:final data):
        state = state.copyWith(status: AuthStatus.authenticated, student: data, clearError: true);
      case AuthError<StudentEntity>():
        state = state.copyWith(status: AuthStatus.unauthenticated);
    }
  }

  Future<bool> login(String studentNumber, String password) async {
    state = state.copyWith(isSubmitting: true, clearError: true);
    final result = await _loginUseCase(studentNumber: studentNumber, password: password);

    switch (result) {
      case AuthSuccess<StudentEntity>(:final data):
        state = state.copyWith(
          status: AuthStatus.authenticated,
          student: data,
          isSubmitting: false,
          clearError: true,
        );
        return true;
      case AuthError<StudentEntity>(:final failure):
        state = state.copyWith(
          status: AuthStatus.unauthenticated,
          isSubmitting: false,
          errorMessage: _messageFor(failure),
        );
        return false;
    }
  }

  Future<void> logout() async {
    await _logoutUseCase();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void clearError() {
    if (state.errorMessage != null) {
      state = state.copyWith(clearError: true);
    }
  }

  String _messageFor(Failure failure) {
    if (failure is ValidationFailure) return failure.message;
    if (failure is UnauthorizedFailure) return 'Invalid student number or password.';
    return failure.message;
  }
}

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(
    loginUseCase: ref.watch(loginUseCaseProvider),
    logoutUseCase: ref.watch(logoutUseCaseProvider),
    restoreSessionUseCase: ref.watch(restoreSessionUseCaseProvider),
  );
});
