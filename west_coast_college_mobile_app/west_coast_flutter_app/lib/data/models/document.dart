class Document {
  final String id;
  final String name;
  final String description;
  final String type;
  final String status;
  final DateTime? issueDate;
  final String? downloadUrl;

  Document({
    required this.id,
    required this.name,
    required this.description,
    required this.type,
    required this.status,
    this.issueDate,
    this.downloadUrl,
  });

  factory Document.fromJson(Map<String, dynamic> json) {
    return Document(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'] ?? '',
      type: json['type'] ?? '',
      status: json['status'] ?? '',
      issueDate: json['issueDate'] != null ? DateTime.parse(json['issueDate']) : null,
      downloadUrl: json['downloadUrl'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'type': type,
      'status': status,
      'issueDate': issueDate?.toIso8601String(),
      'downloadUrl': downloadUrl,
    };
  }
}