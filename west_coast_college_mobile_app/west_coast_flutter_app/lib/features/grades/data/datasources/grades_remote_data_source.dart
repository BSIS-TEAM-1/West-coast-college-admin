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

  Future<Map<String, dynamic>> submitProfessorEvaluation({
    required String schoolYear,
    required String semester,
    String? subjectId,
    required String subjectCode,
    required List<Map<String, dynamic>> ratings,
    String? comment,
  }) async {
    final response = await _client.post(
      ApiConstants.studentEvaluations,
      data: {
        'schoolYear': schoolYear,
        'semester': semester,
        if (subjectId != null && subjectId.isNotEmpty) 'subjectId': subjectId,
        'subjectCode': subjectCode,
        'ratings': ratings,
        'comment': comment ?? '',
      },
    );
    return response['data'] is Map<String, dynamic> ? response['data'] as Map<String, dynamic> : response;
  }
}
