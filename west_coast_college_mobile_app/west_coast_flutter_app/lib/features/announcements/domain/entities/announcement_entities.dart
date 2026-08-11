class AnnouncementMedia {
  final String type; // 'image' | 'video'
  final String url;
  final String? caption;

  const AnnouncementMedia({required this.type, required this.url, this.caption});
}

class Announcement {
  final String id;
  final String title;
  final String message;
  final String type; // 'info' | 'warning' | 'urgent' | 'maintenance'
  final bool isPinned;
  final DateTime? createdAt;
  final List<AnnouncementMedia> media;
  final List<String> targetAudience; // 'all' | 'students' | 'registrar' | 'professor' | 'admin'

  const Announcement({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    required this.isPinned,
    this.createdAt,
    this.media = const [],
    this.targetAudience = const [],
  });

  String get categoryLabel => switch (type) {
        'urgent' => 'Important',
        'warning' => 'Important',
        'maintenance' => 'General',
        _ => 'General',
      };
}

class AnnouncementList {
  final List<Announcement> items;
  final int total;
  final bool hasMore;

  const AnnouncementList({required this.items, required this.total, required this.hasMore});
}
