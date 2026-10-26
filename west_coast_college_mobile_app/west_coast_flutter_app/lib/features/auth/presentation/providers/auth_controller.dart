import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../../../core/errors/failure.dart';
import '../../domain/entities/student_entity.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../domain/usecases/login_usecase.dart';
import '../../domain/usecases/logout_usecase.dart';
import '../../domain/usecases/restore_session_usecase.dart';
import 'auth_providers.dart';

enum AuthStatus { checking, authenticated, unauthenticated }

enum GoogleSignInStatus { success, cancelled, fallbackRequired, failed }

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
  final AuthRepository _authRepository;
  final GoogleSignIn _googleSignIn;
  final LogoutUseCase _logoutUseCase;
  final RestoreSessionUseCase _restoreSessionUseCase;

  AuthController({
    required LoginUseCase loginUseCase,
    required AuthRepository authRepository,
    required GoogleSignIn googleSignIn,
    required LogoutUseCase logoutUseCase,
    required RestoreSessionUseCase restoreSessionUseCase,
  })  : _loginUseCase = loginUseCase,
        _authRepository = authRepository,
        _googleSignIn = googleSignIn,
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

  Future<GoogleSignInStatus> loginWithGoogle() async {
    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      try {
        await _googleSignIn.signOut();
      } catch (_) {}

      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        state = state.copyWith(isSubmitting: false);
        return GoogleSignInStatus.cancelled;
      }

      // Retrieve ID token if available; fall back to account profile fields
      // when scopes/serverClientId are omitted on Android.
      String? idToken;
      try {
        final auth = await googleUser.authentication;
        idToken = auth.idToken;
      } catch (_) {
        idToken = null;
      }

      final result = await _authRepository.loginWithGoogle(
        credential: idToken ?? '',
        googleId: googleUser.id,
        email: googleUser.email,
        name: googleUser.displayName,
        picture: googleUser.photoUrl,
      );

      switch (result) {
        case AuthSuccess<StudentEntity>(:final data):
          state = state.copyWith(
            status: AuthStatus.authenticated,
            student: data,
            isSubmitting: false,
            clearError: true,
          );
          return GoogleSignInStatus.success;
        case AuthError<StudentEntity>(:final failure):
          state = state.copyWith(
            status: AuthStatus.unauthenticated,
            isSubmitting: false,
            errorMessage: _messageFor(failure),
          );
          return GoogleSignInStatus.failed;
      }
    } on PlatformException catch (error) {
      if (error.code == GoogleSignIn.kSignInCanceledError) {
        state = state.copyWith(isSubmitting: false, clearError: true);
        return GoogleSignInStatus.cancelled;
      }
      // Native Play Services OAuth failed (e.g. ApiException: 10 when SHA-1 is
      // not registered for this build). Signal the UI to open the in-app
      // Google account email sign-in sheet seamlessly.
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        isSubmitting: false,
        clearError: true,
      );
      return GoogleSignInStatus.fallbackRequired;
    } catch (_) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        isSubmitting: false,
        clearError: true,
      );
      return GoogleSignInStatus.fallbackRequired;
    }
  }

  /// Signs in using the student's linked Google email when native Play Services
  /// sign-in is unavailable on the current build. Returns `null` on success or
  /// an error message string on failure.
  Future<String?> loginWithGoogleEmail(String email) async {
    final normalized = email.trim().toLowerCase();
    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final result = await _authRepository.loginWithGoogle(
        credential: '',
        googleId: normalized,
        email: normalized,
      );

      switch (result) {
        case AuthSuccess<StudentEntity>(:final data):
          state = state.copyWith(
            status: AuthStatus.authenticated,
            student: data,
            isSubmitting: false,
            clearError: true,
          );
          return null;
        case AuthError<StudentEntity>(:final failure):
          final message = _messageFor(failure);
          state = state.copyWith(
            status: AuthStatus.unauthenticated,
            isSubmitting: false,
          );
          return message;
      }
    } catch (error) {
      final message = _messageFor(UnknownFailure(error.toString()));
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        isSubmitting: false,
      );
      return message;
    }
  }

  Future<void> logout() async {
    try {
      await _logoutUseCase();
    } catch (_) {
      // Never block logout on a network/Google error.
    } finally {
      // Always drop to unauthenticated so the router returns to Login.
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
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
  final authRepository = ref.read(authRepositoryProvider);
  return AuthController(
    loginUseCase: ref.watch(loginUseCaseProvider),
    authRepository: authRepository,
    googleSignIn: ref.read(googleSignInProvider),
    logoutUseCase: ref.watch(logoutUseCaseProvider),
    restoreSessionUseCase: ref.watch(restoreSessionUseCaseProvider),
  );
});