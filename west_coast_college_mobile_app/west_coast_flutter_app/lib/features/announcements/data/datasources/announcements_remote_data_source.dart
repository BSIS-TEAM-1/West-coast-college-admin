import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/api_client.dart';
import '../models/announcement_model.dart';

class AnnouncementsRemoteDataSource {
  final ApiClient _client;
  AnnouncementsRemoteDataSource(this._client);

  Future<AnnouncementListModel> getAnnouncements({int limit = 20, int offset = 0}) async {
    final response = await _client.get(
      ApiConstants.studentAnnouncements,
      queryParameters: {ApiConstants.paramLimit: limit, ApiConstants.paramOffset: offset},
    );
    final data = response['data'] is Map<String, dynamic> ? response['data'] as Map<String, dynamic> : response;
    return AnnouncementListModel.fromJson(data);
  }
}
