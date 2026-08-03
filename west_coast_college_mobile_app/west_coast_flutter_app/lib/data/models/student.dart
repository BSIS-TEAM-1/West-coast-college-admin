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
      id: json['id'] ?? '',
      studentNumber: json['studentNumber'] ?? '',
      firstName: json['firstName'] ?? '',
      middleName: json['middleName'],
      lastName: json['lastName'] ?? '',
      suffix: json['suffix'],
      course: json['course'] ?? 0,
      major: json['major'],
      yearLevel: json['yearLevel'] ?? 1,
      section: json['section'],
      scholarship: json['scholarship'] ?? '',
      semester: json['semester'] ?? '',
      schoolYear: json['schoolYear'] ?? '',
      studentStatus: json['studentStatus'] ?? '',
      lifecycleStatus: json['lifecycleStatus'] ?? '',
      email: json['email'] ?? '',
      contactNumber: json['contactNumber'] ?? '',
      address: json['address'],
      permanentAddress: json['permanentAddress'],
      birthDate: json['birthDate'] != null ? DateTime.parse(json['birthDate']) : null,
      birthPlace: json['birthPlace'],
      gender: json['gender'],
      civilStatus: json['civilStatus'],
      nationality: json['nationality'],
      religion: json['religion'],
      emergencyContact: json['emergencyContact'] != null 
          ? EmergencyContact.fromJson(json['emergencyContact']) 
          : null,
      courseName: json['courseName'],
      courseFullName: json['courseFullName'],
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