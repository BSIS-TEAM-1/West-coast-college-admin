import '../../domain/entities/profile_entity.dart';
import '../../domain/repositories/profile_repository.dart';
import '../datasources/profile_remote_data_source.dart';

class ProfileRepositoryImpl implements ProfileRepository {
  final ProfileRemoteDataSource _remote;
  ProfileRepositoryImpl(this._remote);

  @override
  Future<ProfileEntity> getProfile() => _remote.getProfile();

  @override
  Future<ProfileEntity> updateProfile(Map<String, dynamic> updates) =>
      _remote.updateProfile(updates);
}
