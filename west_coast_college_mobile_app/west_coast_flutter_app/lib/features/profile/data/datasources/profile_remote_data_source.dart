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

  /// Profile picture upload/update. Returns the new profile picture data URL.
  Future<String> uploadProfilePicture({
    required String imageBase64,
    required String mimeType,
  }) async {
    final response = await _client.post(
      ApiConstants.studentProfilePicture,
      data: {
        'imageBase64': imageBase64,
        'mimeType': mimeType,
      },
    );
    final data = response['data'];
    if (data is Map<String, dynamic>) {
      final url = data['profilePictureUrl']?.toString();
      if (url != null && url.isNotEmpty) return url;
    }
    // Fallback: construct from base64 if server didn't return a URL
    return 'data:$mimeType;base64,$imageBase64';
  }
}
