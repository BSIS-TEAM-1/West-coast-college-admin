import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/errors/failure.dart';
import '../../domain/entities/profile_entity.dart';
import '../../domain/usecases/get_profile_usecase.dart';
import '../../domain/usecases/update_profile_usecase.dart';
import '../../domain/usecases/upload_profile_picture_usecase.dart';
import 'profile_providers.dart';

sealed class ProfileState {
  const ProfileState();
}

class ProfileLoading extends ProfileState {
  const ProfileLoading();
}

class ProfileLoaded extends ProfileState {
  final ProfileEntity profile;
  final bool isRefreshing;
  final bool isSaving;
  final bool isUploadingPicture;
  final String? saveError;
  final String? saveSuccess;
  const ProfileLoaded(
    this.profile, {
    this.isRefreshing = false,
    this.isSaving = false,
    this.isUploadingPicture = false,
    this.saveError,
    this.saveSuccess,
  });
}

class ProfileFailed extends ProfileState {
  final String message;
  const ProfileFailed(this.message);
}

class ProfileController extends StateNotifier<ProfileState> {
  final GetProfileUseCase _getProfile;
  final UpdateProfileUseCase _updateProfile;
  final UploadProfilePictureUseCase _uploadPicture;

  ProfileController(this._getProfile, this._updateProfile, this._uploadPicture)
      : super(const ProfileLoading()) {
    load();
  }

  Future<void> load() async {
    state = const ProfileLoading();
    await _fetch();
  }

  Future<void> refresh() async {
    final current = state;
    if (current is ProfileLoaded) {
      state = ProfileLoaded(current.profile, isRefreshing: true);
    }
    await _fetch();
  }

  Future<void> _fetch() async {
    try {
      final profile = await _getProfile();
      state = ProfileLoaded(profile);
    } catch (error) {
      state = ProfileFailed(mapExceptionToFailure(error).message);
    }
  }

  Future<bool> updateProfile(Map<String, dynamic> updates) async {
    final current = state;
    if (current is! ProfileLoaded) return false;

    state = ProfileLoaded(current.profile, isSaving: true);
    try {
      final updated = await _updateProfile(updates);
      state = ProfileLoaded(updated, saveSuccess: 'Profile updated successfully.');
      return true;
    } catch (error) {
      state = ProfileLoaded(current.profile, saveError: mapExceptionToFailure(error).message);
      return false;
    }
  }

  /// One-time profile picture upload. Returns `true` on success.
  /// If the picture is already set, the server returns 409 and this
  /// returns `false` with [ProfileLoaded.saveError] populated.
  Future<bool> uploadProfilePicture({required String imageBase64, required String mimeType}) async {
    final current = state;
    if (current is! ProfileLoaded) return false;

    state = ProfileLoaded(current.profile, isUploadingPicture: true);
    try {
      final pictureUrl = await _uploadPicture(imageBase64: imageBase64, mimeType: mimeType);
      // Patch the profile entity with the new picture URL so the UI updates
      // immediately without requiring a refetch.
      final updatedProfile = ProfileEntity(
        id: current.profile.id,
        studentNumber: current.profile.studentNumber,
        firstName: current.profile.firstName,
        middleName: current.profile.middleName,
        lastName: current.profile.lastName,
        suffix: current.profile.suffix,
        fullName: current.profile.fullName,
        course: current.profile.course,
        major: current.profile.major,
        yearLevel: current.profile.yearLevel,
        section: current.profile.section,
        semester: current.profile.semester,
        schoolYear: current.profile.schoolYear,
        studentStatus: current.profile.studentStatus,
        lifecycleStatus: current.profile.lifecycleStatus,
        enrollmentStatus: current.profile.enrollmentStatus,
        corStatus: current.profile.corStatus,
        scholarship: current.profile.scholarship,
        email: current.profile.email,
        contactNumber: current.profile.contactNumber,
        address: current.profile.address,
        permanentAddress: current.profile.permanentAddress,
        birthDate: current.profile.birthDate,
        birthPlace: current.profile.birthPlace,
        gender: current.profile.gender,
        civilStatus: current.profile.civilStatus,
        nationality: current.profile.nationality,
        religion: current.profile.religion,
        profilePictureUrl: pictureUrl,
        emergencyContact: current.profile.emergencyContact,
      );
      state = ProfileLoaded(
        updatedProfile,
        saveSuccess: 'Profile picture uploaded successfully. This cannot be changed later.',
      );
      return true;
    } catch (error) {
      state = ProfileLoaded(current.profile, saveError: mapExceptionToFailure(error).message);
      return false;
    }
  }

  void clearMessages() {
    final current = state;
    if (current is ProfileLoaded) {
      state = ProfileLoaded(current.profile);
    }
  }
}

final profileControllerProvider = StateNotifierProvider.autoDispose<ProfileController, ProfileState>((ref) {
  return ProfileController(
    ref.watch(getProfileUseCaseProvider),
    ref.watch(updateProfileUseCaseProvider),
    ref.watch(uploadProfilePictureUseCaseProvider),
  );
});
