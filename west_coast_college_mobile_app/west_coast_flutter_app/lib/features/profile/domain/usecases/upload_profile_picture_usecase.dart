import '../repositories/profile_repository.dart';

/// Profile picture upload/update.
class UploadProfilePictureUseCase {
  final ProfileRepository _repository;
  const UploadProfilePictureUseCase(this._repository);

  /// Returns the new profile picture data URL on success.
  Future<String> call({required String imageBase64, required String mimeType}) =>
      _repository.uploadProfilePicture(imageBase64: imageBase64, mimeType: mimeType);
}
