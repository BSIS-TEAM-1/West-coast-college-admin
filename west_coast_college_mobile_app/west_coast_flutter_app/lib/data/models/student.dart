class Student {
  final String id;
  final String studentNumber;
  final String firstName;
  final String? middleName;
  final String lastName;
  final String? suffix;
  final int course;
  final String? major;
  final int yearLevel;
  final String? section;
  final String scholarship;
  final String semester;
  final String schoolYear;
  final String studentStatus;
  final String lifecycleStatus;
  final String email;
  final String contactNumber;
  final String? address;
  final String? permanentAddress;
  final DateTime? birthDate;
  final String? birthPlace;
  final String? gender;
  final String? civilStatus;
  final String? nationality;
  final String? religion;
  final EmergencyContact? emergencyContact;
  final String? courseName;
  final String? courseFullName;
  final double? latestGrade;

  Student({
    required this.id,
    required this.studentNumber,
    required this.firstName,
    this.middleName,
    required this.lastName,
    this.suffix,
    required this.course,
    this.major,
    required this.yearLevel,
    this.section,
    required this.scholarship,
    required this.semester,
    required this.schoolYear,
    required this.studentStatus,
    required this.lifecycleStatus,
    required this.email,
    required this.contactNumber,
    this.address,
    this.permanentAddress,
    this.birthDate,
    this.birthPlace,
    this.gender,
    this.civilStatus,
    this.nationality,
    this.religion,
    this.emergencyContact,
    this.courseName,
    this.courseFullName,
    this.latestGrade,
  });

  factory Student.fromJson(Map<String, dynamic> json) {
    return Student(
      id: json['id']?.toString() ?? '',
      studentNumber: json['studentNumber']?.toString() ?? '',
      firstName: json['firstName']?.toString() ?? '',
      middleName: json['middleName']?.toString(),
      lastName: json['lastName']?.toString() ?? '',
      suffix: json['suffix']?.toString(),
      course: json['course'] is int ? json['course'] : int.tryParse(json['course']?.toString() ?? '0') ?? 0,
      major: json['major']?.toString(),
      yearLevel: json['yearLevel'] is int ? json['yearLevel'] : int.tryParse(json['yearLevel']?.toString() ?? '1') ?? 1,
      section: json['section']?.toString(),
      scholarship: json['scholarship']?.toString() ?? '',
      semester: json['semester']?.toString() ?? '',
      schoolYear: json['schoolYear']?.toString() ?? '',
      studentStatus: json['studentStatus']?.toString() ?? '',
      lifecycleStatus: json['lifecycleStatus']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      contactNumber: json['contactNumber']?.toString() ?? '',
      address: json['address']?.toString(),
      permanentAddress: json['permanentAddress']?.toString(),
      birthDate: json['birthDate'] != null ? DateTime.parse(json['birthDate']) : null,
      birthPlace: json['birthPlace']?.toString(),
      gender: json['gender']?.toString(),
      civilStatus: json['civilStatus']?.toString(),
      nationality: json['nationality']?.toString(),
      religion: json['religion']?.toString(),
      emergencyContact: json['emergencyContact'] != null 
          ? EmergencyContact.fromJson(json['emergencyContact']) 
          : null,
      courseName: json['courseName']?.toString(),
      courseFullName: json['courseFullName']?.toString(),
      latestGrade: json['latestGrade']?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'studentNumber': studentNumber,
      'firstName': firstName,
      'middleName': middleName,
      'lastName': lastName,
      'suffix': suffix,
      'course': course,
      'major': major,
      'yearLevel': yearLevel,
      'section': section,
      'scholarship': scholarship,
      'semester': semester,
      'schoolYear': schoolYear,
      'studentStatus': studentStatus,
      'lifecycleStatus': lifecycleStatus,
      'email': email,
      'contactNumber': contactNumber,
      'address': address,
      'permanentAddress': permanentAddress,
      'birthDate': birthDate?.toIso8601String(),
      'birthPlace': birthPlace,
      'gender': gender,
      'civilStatus': civilStatus,
      'nationality': nationality,
      'religion': religion,
      'emergencyContact': emergencyContact?.toJson(),
      'courseName': courseName,
      'courseFullName': courseFullName,
      'latestGrade': latestGrade,
    };
  }

  String get fullName {
    return '$firstName ${middleName ?? ''} $lastName ${suffix ?? ''}'.trim();
  }

  // Empty constructor for error cases
  static Student empty() {
    return Student(
      id: '',
      studentNumber: '',
      firstName: '',
      lastName: '',
      course: 0,
      yearLevel: 1,
      scholarship: '',
      semester: '',
      schoolYear: '',
      studentStatus: '',
      lifecycleStatus: '',
      email: '',
      contactNumber: '',
    );
  }
}

class EmergencyContact {
  final String name;
  final String relationship;
  final String contactNumber;
  final String? address;

  EmergencyContact({
    required this.name,
    required this.relationship,
    required this.contactNumber,
    this.address,
  });

  factory EmergencyContact.fromJson(Map<String, dynamic> json) {
    return EmergencyContact(
      name: json['name'] ?? '',
      relationship: json['relationship'] ?? '',
      contactNumber: json['contactNumber'] ?? '',
      address: json['address'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'relationship': relationship,
      'contactNumber': contactNumber,
      'address': address,
    };
  }
}