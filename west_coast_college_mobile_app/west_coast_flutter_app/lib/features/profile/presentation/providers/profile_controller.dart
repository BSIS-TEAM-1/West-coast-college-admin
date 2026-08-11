import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/errors/failure.dart';
import '../../domain/entities/profile_entity.dart';
import '../../domain/usecases/get_profile_usecase.dart';
import '../../domain/usecases/update_profile_usecase.dart';
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
  final String? saveError;
  final String? saveSuccess;
  const ProfileLoaded(this.profile, {this.isRefreshing = false, this.isSaving = false, this.saveError, this.saveSuccess});
}

class ProfileFailed extends ProfileState {
  final String message;
  const ProfileFailed(this.message);
}

class ProfileController extends StateNotifier<ProfileState> {
  final GetProfileUseCase _getProfile;
  final UpdateProfileUseCase _updateProfile;

  ProfileController(this._getProfile, this._updateProfile) : super(const ProfileLoading()) {
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

  void clearMessages() {
    final current = state;
    if (current is ProfileLoaded) {
      state = ProfileLoaded(current.profile);
    }
  }
}

final profileControllerProvider = StateNotifierProvider.autoDispose<ProfileController, ProfileState>((ref) {
  return ProfileController(ref.watch(getProfileUseCaseProvider), ref.watch(updateProfileUseCaseProvider));
});
