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

  AuthRepositoryImpl(this._remote, this._storage, [GoogleSignIn? googleSignIn]) : _googleSignIn = googleSignIn ?? GoogleSignIn();

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
  Future<AuthResult<StudentEntity>> loginWithGoogle({
    required String credential,
    String? googleId,
    String? email,
    String? name,
    String? picture,
  }) async {
    try {
      // Verify the Google credential with the backend
      final apiClient = ApiClient(_storage);
      final normalizedEmail = email?.trim().toLowerCase();
      final resolvedGoogleId = (googleId != null && googleId.trim().isNotEmpty)
          ? googleId.trim()
          : (normalizedEmail ?? '');
      final body = <String, dynamic>{
        if (credential.isNotEmpty) 'credential': credential,
        if (resolvedGoogleId.isNotEmpty) 'googleId': resolvedGoogleId,
        if (normalizedEmail != null && normalizedEmail.isNotEmpty) 'email': normalizedEmail,
        if (name != null && name.isNotEmpty) 'name': name,
        if (picture != null && picture.isNotEmpty) 'picture': picture,
      };

      final response = await apiClient.post(
        '/student/google-login',
        data: body,
      );

      final payload = response['data'] is Map<String, dynamic>
          ? response['data'] as Map<String, dynamic>
          : response;

      final studentJson = payload['student'] is Map<String, dynamic>
          ? payload['student'] as Map<String, dynamic>
          : <String, dynamic>{};
      final student = StudentModel.fromJson(studentJson);

      final accessToken = (payload['accessToken'] ?? '').toString();
      final refreshToken = (payload['refreshToken'] ?? accessToken).toString();

      await _storage.saveSession(
        accessToken: accessToken,
        refreshToken: refreshToken,
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
      // Best-effort and short: don't make the user wait on a slow/offline server.
      await _remote.logout().timeout(const Duration(seconds: 4));
    } catch (_) {
      // Local session is cleared regardless of server outcome.
    }
    try {
      // disconnect() throws when the student never signed in with Google
      // (password login), which previously aborted logout entirely.
      await _googleSignIn.signOut();
    } catch (_) {
      // Ignore: no Google session to end.
    }
    await _storage.clearSession();
  }
}