import '../entities/announcement_entities.dart';

abstract class AnnouncementsRepository {
  Future<AnnouncementList> getAnnouncements({int limit = 20, int offset = 0});
}
