import '../../../../core/errors/failure.dart';
import '../../../../core/storage/secure_storage_service.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../domain/entities/student_entity.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_data_source.dart';
import '../models/student_model.dart';
import '../../../../core/network/api_client.dart';

class AuthRepositoryImpl implements AuthRepository {
  final AuthRemoteDataSource _remote;
  final SecureStorageService _storage;
  final GoogleSignIn _googleSignIn;

  AuthRepositoryImpl(this._remote, this._storage, [GoogleSignIn? googleSignIn])
      : _googleSignIn = googleSignIn ?? GoogleSignIn();

  @override
  Future<AuthResult<StudentEntity>> login(
      {required String studentNumber, required String password}) async {
    try {
      final payload = await _remote.login(studentNumber: studentNumber, password: password);
      final studentJson =
          payload['student'] is Map<String, dynamic>
              ? payload['student'] as Map<String, dynamic>
              : <String, dynamic>{};
      final student = StudentModel.fromJson(studentJson);

      await _storage.saveSession(
        accessToken: (payload['accessToken'] ?? '').toString(),
        refreshToken: (payload['refreshToken'] ?? payload['accessToken'] ?? '').toString(),
        studentId: student.id,
        studentNumber: student.studentNumber,
      );

      return AuthSuccess(student);
    } catch (error) {
      return AuthError(mapExceptionToFailure(error));
    }
  }

  @override
  Future<AuthResult<StudentEntity>> loginWithGoogle() async {
    try {
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) return AuthError(UnknownFailure('User cancelled sign in'));

      final googleAuth = await googleUser.authentication;

      // Use Google API to get user profile info with email
      final apiClient = ApiClient(_storage);
      final profileResponse = await apiClient.post(
        '/student/google-login',
        data: {
          'googleId': googleUser.id,
          'email': googleUser.email,
          'displayName': googleUser.displayName,
        },
      );

      final studentJson = profileResponse['student'] is Map<String, dynamic>
          ? profileResponse['student'] as Map<String, dynamic>
          : <String, dynamic>{};
      final student = StudentModel.fromJson(studentJson);

      await _storage.saveSession(
        accessToken: (profileResponse['accessToken'] ?? '').toString(),
        refreshToken: (profileResponse['refreshToken'] ?? profileResponse['accessToken'] ?? '').toString(),
        studentId: student.id,
        studentNumber: student.studentNumber,
      );

      return AuthSuccess(student);
    } catch (error) {
      return AuthError(mapExceptionToFailure(error));
    }
  }

  @override
  Future<bool> hasStoredSession() => _storage.hasSession();

  @override
  Future<AuthResult<StudentEntity>> restoreSession() async {
    try {
      final student = await _remote.getCurrentStudent();
      return AuthSuccess(student);
    } catch (error) {
      final failure = mapExceptionToFailure(error);
      if (failure is UnauthorizedFailure) {
        await _storage.clearSession();
      }
      return AuthError(failure);
    }
  }

  @override
  Future<void> logout() async {
    try {
      await _remote.logout();
    } catch (_) {
      // Best-effort: local session is cleared regardless of server outcome.
    }
    await _googleSignIn.disconnect();
    await _storage.clearSession();
  }
}