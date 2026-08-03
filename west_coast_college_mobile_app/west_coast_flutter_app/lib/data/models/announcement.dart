class Announcement {
  final String id;
  final String title;
  final String message;
  final String category;
  final DateTime date;
  final String author;
  final bool isUrgent;

  Announcement({
    required this.id,
    required this.title,
    required this.message,
    required this.category,
    required this.date,
    required this.author,
    required this.isUrgent,
  });

  factory Announcement.fromJson(Map<String, dynamic> json) {
    return Announcement(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      message: json['message'] ?? '',
      category: json['category'] ?? '',
      date: json['date'] != null ? DateTime.parse(json['date']) : DateTime.now(),
      author: json['author'] ?? '',
      isUrgent: json['isUrgent'] ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'message': message,
      'category': category,
      'date': date.toIso8601String(),
      'author': author,
      'isUrgent': isUrgent,
    };
  }
}