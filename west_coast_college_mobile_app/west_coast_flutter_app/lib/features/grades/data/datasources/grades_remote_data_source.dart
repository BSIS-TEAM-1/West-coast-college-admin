import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/api_client.dart';
import '../models/grade_model.dart';

class GradesRemoteDataSource {
  final ApiClient _client;
  GradesRemoteDataSource(this._client);

  Future<GradesDataModel> getGrades() async {
    final response = await _client.get(ApiConstants.studentGrades);
    final data = response['data'] is Map<String, dynamic> ? response['data'] as Map<String, dynamic> : response;
    return GradesDataModel.fromJson(data);
  }
}
