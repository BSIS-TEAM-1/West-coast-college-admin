import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/api_client.dart';
import '../models/schedule_model.dart';

class ScheduleRemoteDataSource {
  final ApiClient _client;
  ScheduleRemoteDataSource(this._client);

  Future<WeeklyScheduleModel> getWeeklySchedule() async {
    final response = await _client.get(ApiConstants.studentScheduleWeekly);
    final data = response['data'] is Map<String, dynamic> ? response['data'] as Map<String, dynamic> : response;
    return WeeklyScheduleModel.fromJson(data);
  }
}
