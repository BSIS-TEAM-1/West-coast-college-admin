class ProfileEntity {
  final String id;
  final String studentNumber;
  final String firstName;
  final String? middleName;
  final String lastName;
  final String? suffix;
  final String fullName;
  final int course;
  final String? major;
  final int yearLevel;
  final String? section;
  final String? semester;
  final String? schoolYear;
  final String? studentStatus;
  final String? lifecycleStatus;
  final String? enrollmentStatus;
  final String? corStatus;
  final String? scholarship;
  final String email;
  final String? contactNumber;
  final String? address;
  final String? permanentAddress;
  final DateTime? birthDate;
  final String? birthPlace;
  final String? gender;
  final String? civilStatus;
  final String? nationality;
  final String? religion;
  final EmergencyContactEntity? emergencyContact;

  const ProfileEntity({
    required this.id,
    required this.studentNumber,
    required this.firstName,
    this.middleName,
    required this.lastName,
    this.suffix,
    required this.fullName,
    required this.course,
    this.major,
    required this.yearLevel,
    this.section,
    this.semester,
    this.schoolYear,
    this.studentStatus,
    this.lifecycleStatus,
    this.enrollmentStatus,
    this.corStatus,
    this.scholarship,
    required this.email,
    this.contactNumber,
    this.address,
    this.permanentAddress,
    this.birthDate,
    this.birthPlace,
    this.gender,
    this.civilStatus,
    this.nationality,
    this.religion,
    this.emergencyContact,
  });
}

class EmergencyContactEntity {
  final String name;
  final String relationship;
  final String contactNumber;
  final String? address;

  const EmergencyContactEntity({
    required this.name,
    required this.relationship,
    required this.contactNumber,
    this.address,
  });
}
