import '../entities/student_entity.dart';
import '../repositories/auth_repository.dart';

class LoginUseCase {
  final AuthRepository _repository;
  const LoginUseCase(this._repository);

  Future<AuthResult<StudentEntity>> call({
    required String studentNumber,
    required String password,
  }) {
    return _repository.login(studentNumber: studentNumber, password: password);
  }
}
