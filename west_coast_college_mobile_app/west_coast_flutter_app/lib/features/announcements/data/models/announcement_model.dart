import '../../domain/entities/announcement_entities.dart';

class AnnouncementMediaModel extends AnnouncementMedia {
  const AnnouncementMediaModel({required super.type, required super.url, super.caption});

  factory AnnouncementMediaModel.fromJson(Map<String, dynamic> json) {
    return AnnouncementMediaModel(
      type: (json['type'] ?? 'image').toString(),
      url: (json['url'] ?? '').toString(),
      caption: json['caption']?.toString(),
    );
  }
}

class AnnouncementModel extends Announcement {
  const AnnouncementModel({
    required super.id,
    required super.title,
    required super.message,
    required super.type,
    required super.isPinned,
    super.createdAt,
    super.media,
    List<String> targetAudience = const [],
  }) : super(targetAudience: targetAudience);

  factory AnnouncementModel.fromJson(Map<String, dynamic> json) {
    return AnnouncementModel(
      id: (json['id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      message: (json['message'] ?? '').toString(),
      type: (json['type'] ?? 'info').toString(),
      isPinned: json['isPinned'] == true,
      createdAt: DateTime.tryParse('${json['createdAt']}'),
      targetAudience: ((json['targetAudience'] as List?) ?? [])
          .map((e) => e.toString())
          .toList(),
      media: ((json['media'] as List?) ?? [])
          .map((item) => AnnouncementMediaModel.fromJson((item as Map).cast<String, dynamic>()))
          .toList(),
    );
  }
}

class AnnouncementListModel extends AnnouncementList {
  const AnnouncementListModel({required super.items, required super.total, required super.hasMore});

  factory AnnouncementListModel.fromJson(Map<String, dynamic> json) {
    return AnnouncementListModel(
      items: ((json['items'] as List?) ?? [])
          .map((item) => AnnouncementModel.fromJson((item as Map).cast<String, dynamic>()))
          .toList(),
      total: json['total'] is int ? json['total'] as int : int.tryParse('${json['total']}') ?? 0,
      hasMore: json['hasMore'] == true,
    );
  }
}
