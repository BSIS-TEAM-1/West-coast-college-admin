import '../entities/student_entity.dart';
import '../repositories/auth_repository.dart';

/// Checks whether a session exists locally and, if so, validates it against
/// the backend so the app never trusts a stale/expired token.
class RestoreSessionUseCase {
  final AuthRepository _repository;
  const RestoreSessionUseCase(this._repository);

  Future<AuthResult<StudentEntity>?> call() async {
    final hasSession = await _repository.hasStoredSession();
    if (!hasSession) return null;
    return _repository.restoreSession();
  }
}
