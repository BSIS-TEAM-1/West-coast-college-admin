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
}
