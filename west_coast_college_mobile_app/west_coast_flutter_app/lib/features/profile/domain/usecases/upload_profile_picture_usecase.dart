import '../repositories/profile_repository.dart';

/// One-time profile picture upload. The server enforces the one-time-only rule
/// and returns a 409 (mapped to [AppException]) if a picture is already set.
class UploadProfilePictureUseCase {
  final ProfileRepository _repository;
  const UploadProfilePictureUseCase(this._repository);

  /// Returns the new profile picture data URL on success.
  Future<String> call({required String imageBase64, required String mimeType}) =>
      _repository.uploadProfilePicture(imageBase64: imageBase64, mimeType: mimeType);
}
