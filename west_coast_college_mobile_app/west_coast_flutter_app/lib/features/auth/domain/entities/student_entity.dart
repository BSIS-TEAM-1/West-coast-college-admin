/// The authenticated student, as understood by the rest of the app.
/// Deliberately small — just what's needed for greeting/identity display.
/// Screen-specific data (grades, schedule, etc.) lives in their own features.
class StudentEntity {
  final String id;
  final String studentNumber;
  final String firstName;
  final String lastName;
  final String fullName;
  final int course;
  final String? courseLabel;
  final int yearLevel;
  final String? section;

  const StudentEntity({
    required this.id,
    required this.studentNumber,
    required this.firstName,
    required this.lastName,
    required this.fullName,
    required this.course,
    this.courseLabel,
    required this.yearLevel,
    this.section,
  });
}
