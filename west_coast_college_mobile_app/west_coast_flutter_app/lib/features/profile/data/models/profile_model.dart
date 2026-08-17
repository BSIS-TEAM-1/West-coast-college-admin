import '../../domain/entities/profile_entity.dart';

class EmergencyContactModel extends EmergencyContactEntity {
  const EmergencyContactModel({
    required super.name,
    required super.relationship,
    required super.contactNumber,
    super.address,
  });

  factory EmergencyContactModel.fromJson(Map<String, dynamic> json) {
    return EmergencyContactModel(
      name: (json['name'] ?? '').toString(),
      relationship: (json['relationship'] ?? '').toString(),
      contactNumber: (json['contactNumber'] ?? '').toString(),
      address: json['address']?.toString(),
    );
  }
}

class ProfileModel extends ProfileEntity {
  const ProfileModel({
    required super.id,
    required super.studentNumber,
    required super.firstName,
    super.middleName,
    required super.lastName,
    super.suffix,
    required super.fullName,
    required super.course,
    super.major,
    required super.yearLevel,
    super.section,
    super.semester,
    super.schoolYear,
    super.studentStatus,
    super.lifecycleStatus,
    super.enrollmentStatus,
    super.corStatus,
    super.scholarship,
    required super.email,
    super.contactNumber,
    super.address,
    super.permanentAddress,
    super.birthDate,
    super.birthPlace,
    super.gender,
    super.civilStatus,
    super.nationality,
    super.religion,
    super.profilePictureUrl,
    super.emergencyContact,
  });

  factory ProfileModel.fromJson(Map<String, dynamic> json) {
    return ProfileModel(
      id: (json['id'] ?? '').toString(),
      studentNumber: (json['studentNumber'] ?? '').toString(),
      firstName: (json['firstName'] ?? '').toString(),
      middleName: json['middleName']?.toString(),
      lastName: (json['lastName'] ?? '').toString(),
      suffix: json['suffix']?.toString(),
      fullName: (json['fullName'] ?? '').toString(),
      course: json['course'] is int ? json['course'] as int : int.tryParse('${json['course']}') ?? 0,
      major: json['major']?.toString(),
      yearLevel: json['yearLevel'] is int ? json['yearLevel'] as int : int.tryParse('${json['yearLevel']}') ?? 1,
      section: json['section']?.toString(),
      semester: json['semester']?.toString(),
      schoolYear: json['schoolYear']?.toString(),
      studentStatus: json['studentStatus']?.toString(),
      lifecycleStatus: json['lifecycleStatus']?.toString(),
      enrollmentStatus: json['enrollmentStatus']?.toString(),
      corStatus: json['corStatus']?.toString(),
      scholarship: json['scholarship']?.toString(),
      email: (json['email'] ?? '').toString(),
      contactNumber: json['contactNumber']?.toString(),
      address: json['address']?.toString(),
      permanentAddress: json['permanentAddress']?.toString(),
      birthDate: json['birthDate'] != null ? DateTime.tryParse('${json['birthDate']}') : null,
      birthPlace: json['birthPlace']?.toString(),
      gender: json['gender']?.toString(),
      civilStatus: json['civilStatus']?.toString(),
      nationality: json['nationality']?.toString(),
      religion: json['religion']?.toString(),
      profilePictureUrl: json['profilePictureUrl']?.toString(),
      emergencyContact: json['emergencyContact'] is Map
          ? EmergencyContactModel.fromJson((json['emergencyContact'] as Map).cast<String, dynamic>())
          : null,
    );
  }
}
