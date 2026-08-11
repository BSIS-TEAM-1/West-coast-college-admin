import '../entities/announcement_entities.dart';
import '../repositories/announcements_repository.dart';

class GetAnnouncementsUseCase {
  final AnnouncementsRepository _repository;
  const GetAnnouncementsUseCase(this._repository);

  Future<AnnouncementList> call({int limit = 20, int offset = 0}) =>
      _repository.getAnnouncements(limit: limit, offset: offset);
}
