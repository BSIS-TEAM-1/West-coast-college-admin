import '../entities/profile_entity.dart';

abstract class ProfileRepository {
  Future<ProfileEntity> getProfile();
  Future<ProfileEntity> updateProfile(Map<String, dynamic> updates);
  /// One-time profile picture upload. Returns the new profile picture data URL.
  Future<String> uploadProfilePicture({required String imageBase64, required String mimeType});
}
