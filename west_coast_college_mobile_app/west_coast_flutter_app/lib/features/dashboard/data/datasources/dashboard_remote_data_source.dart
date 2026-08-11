import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/api_client.dart';
import '../models/dashboard_model.dart';

class DashboardRemoteDataSource {
  final ApiClient _client;
  DashboardRemoteDataSource(this._client);

  Future<DashboardSummaryModel> getDashboard() async {
    final response = await _client.get(ApiConstants.studentDashboard);
    final data = response['data'] is Map<String, dynamic> ? response['data'] as Map<String, dynamic> : response;
    return DashboardSummaryModel.fromJson(data);
  }
}
