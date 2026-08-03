class Grade {
  final String id;
  final String studentId;
  final String semester;
  final String schoolYear;
  final String subject;
  final String courseCode;
  final String grade;
  final double units;
  final double credits;
  final String status;

  Grade({
    required this.id,
    required this.studentId,
    required this.semester,
    required this.schoolYear,
    required this.subject,
    required this.courseCode,
    required this.grade,
    required this.units,
    required this.credits,
    required this.status,
  });

  factory Grade.fromJson(Map<String, dynamic> json) {
    return Grade(
      id: json['id'] ?? '',
      studentId: json['studentId'] ?? '',
      semester: json['semester'] ?? '',
      schoolYear: json['schoolYear'] ?? '',
      subject: json['subject'] ?? '',
      courseCode: json['courseCode'] ?? '',
      grade: json['grade'] ?? '',
      units: (json['units'] ?? 0).toDouble(),
      credits: (json['credits'] ?? 0).toDouble(),
      status: json['status'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'studentId': studentId,
      'semester': semester,
      'schoolYear': schoolYear,
      'subject': subject,
      'courseCode': courseCode,
      'grade': grade,
      'units': units,
      'credits': credits,
      'status': status,
    };
  }
}