class Schedule {
  final String id;
  final String studentId;
  final String day;
  final String startTime;
  final String endTime;
  final String subject;
  final String courseCode;
  final String room;
  final String professor;

  Schedule({
    required this.id,
    required this.studentId,
    required this.day,
    required this.startTime,
    required this.endTime,
    required this.subject,
    required this.courseCode,
    required this.room,
    required this.professor,
  });

  factory Schedule.fromJson(Map<String, dynamic> json) {
    return Schedule(
      id: json['id'] ?? '',
      studentId: json['studentId'] ?? '',
      day: json['day'] ?? '',
      startTime: json['startTime'] ?? '',
      endTime: json['endTime'] ?? '',
      subject: json['subject'] ?? '',
      courseCode: json['courseCode'] ?? '',
      room: json['room'] ?? '',
      professor: json['professor'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'studentId': studentId,
      'day': day,
      'startTime': startTime,
      'endTime': endTime,
      'subject': subject,
      'courseCode': courseCode,
      'room': room,
      'professor': professor,
    };
  }
}