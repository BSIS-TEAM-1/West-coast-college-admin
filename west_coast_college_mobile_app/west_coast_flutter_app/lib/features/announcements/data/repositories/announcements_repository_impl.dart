import '../../domain/entities/announcement_entities.dart';
import '../../domain/repositories/announcements_repository.dart';
import '../datasources/announcements_remote_data_source.dart';

class AnnouncementsRepositoryImpl implements AnnouncementsRepository {
  final AnnouncementsRemoteDataSource _remote;
  AnnouncementsRepositoryImpl(this._remote);

  @override
  Future<AnnouncementList> getAnnouncements({int limit = 20, int offset = 0}) =>
      _remote.getAnnouncements(limit: limit, offset: offset);
}
