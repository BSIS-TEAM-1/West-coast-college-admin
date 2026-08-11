import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/api_client.dart';
import '../models/profile_model.dart';

class ProfileRemoteDataSource {
  final ApiClient _client;
  ProfileRemoteDataSource(this._client);

  Future<ProfileModel> getProfile() async {
    final response = await _client.get(ApiConstants.studentMe);
    final data = response['data'] is Map<String, dynamic> ? response['data'] as Map<String, dynamic> : response;
    return ProfileModel.fromJson(data);
  }

  Future<ProfileModel> updateProfile(Map<String, dynamic> updates) async {
    final response = await _client.put(ApiConstants.studentProfileUpdate, data: updates);
    final data = response['data'] is Map<String, dynamic> ? response['data'] as Map<String, dynamic> : response;
    return ProfileModel.fromJson(data);
  }
}
