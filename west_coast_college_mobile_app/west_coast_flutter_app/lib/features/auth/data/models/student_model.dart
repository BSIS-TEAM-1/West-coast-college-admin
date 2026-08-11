import '../../domain/entities/student_entity.dart';

class StudentModel extends StudentEntity {
  const StudentModel({
    required super.id,
    required super.studentNumber,
    required super.firstName,
    required super.lastName,
    required super.fullName,
    required super.course,
    super.courseLabel,
    required super.yearLevel,
    super.section,
  });

  factory StudentModel.fromJson(Map<String, dynamic> json) {
    final firstName = (json['firstName'] ?? '').toString();
    final lastName = (json['lastName'] ?? '').toString();
    return StudentModel(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      studentNumber: (json['studentNumber'] ?? '').toString(),
      firstName: firstName,
      lastName: lastName,
      fullName: (json['fullName'] ?? '$firstName $lastName').toString().trim(),
      course: json['course'] is int ? json['course'] as int : int.tryParse('${json['course']}') ?? 0,
      courseLabel: json['courseLabel']?.toString(),
      yearLevel: json['yearLevel'] is int ? json['yearLevel'] as int : int.tryParse('${json['yearLevel']}') ?? 1,
      section: json['section']?.toString(),
    );
  }
}
