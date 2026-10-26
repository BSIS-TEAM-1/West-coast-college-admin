import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/api_client.dart';
import '../models/student_model.dart';

class AuthRemoteDataSource {
  final ApiClient _client;

  AuthRemoteDataSource(this._client);

  /// Returns the raw login payload: accessToken, refreshToken, and student.
  Future<Map<String, dynamic>> login({
    required String studentNumber,
    required String password,
  }) async {
    final response = await _client.post(
      ApiConstants.login,
      data: {'studentNumber': studentNumber, 'password': password},
    );
    return response['data'] is Map<String, dynamic> ? response['data'] as Map<String, dynamic> : response;
  }

  Future<StudentModel> getCurrentStudent() async {
    final response = await _client.get(ApiConstants.studentMe);
    final data = response['data'] is Map<String, dynamic> ? response['data'] as Map<String, dynamic> : response;
    return StudentModel.fromJson(data);
  }

  Future<void> logout() async {
    await _client.post(ApiConstants.logout);
  }

  /// Emails a 6-digit reset code. The server answers generically so it never
  /// reveals whether the account exists.
  Future<void> requestPasswordReset(String identifier) async {
    await _client.post(ApiConstants.forgotPassword, data: {'identifier': identifier});
  }

  /// Exchanges the emailed code for a short-lived, single-use reset token.
  Future<String> verifyResetCode({required String identifier, required String code}) async {
    final response = await _client.post(
      ApiConstants.verifyResetCode,
      data: {'identifier': identifier, 'code': code},
    );
    final data = response['data'] is Map<String, dynamic> ? response['data'] as Map<String, dynamic> : response;
    return (data['resetToken'] ?? '').toString();
  }

  Future<void> resetPassword({required String resetToken, required String newPassword}) async {
    await _client.post(
      ApiConstants.resetPassword,
      data: {'resetToken': resetToken, 'newPassword': newPassword},
    );
  }
}
