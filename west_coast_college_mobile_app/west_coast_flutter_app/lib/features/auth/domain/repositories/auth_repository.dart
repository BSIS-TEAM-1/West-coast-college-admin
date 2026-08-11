import '../../../../core/errors/failure.dart';
import '../entities/student_entity.dart';

/// Result wrapper so use cases/providers can branch on success vs failure
/// without throwing across layers.
sealed class AuthResult<T> {
  const AuthResult();
}

class AuthSuccess<T> extends AuthResult<T> {
  final T data;
  const AuthSuccess(this.data);
}

class AuthError<T> extends AuthResult<T> {
  final Failure failure;
  const AuthError(this.failure);
}

abstract class AuthRepository {
  /// Authenticates with the backend and persists the session on success.
  Future<AuthResult<StudentEntity>> login({
    required String studentNumber,
    required String password,
  });

  /// True if a previously-saved session token exists locally.
  Future<bool> hasStoredSession();

  /// Validates the stored session against the backend and returns the
  /// current student, or a failure (e.g. expired/invalid token).
  Future<AuthResult<StudentEntity>> restoreSession();

  /// Clears the local session. Best-effort notifies the backend too.
  Future<void> logout();
}
