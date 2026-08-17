import '../../domain/entities/dashboard_entities.dart';

class ProfileSummaryModel extends ProfileSummary {
  const ProfileSummaryModel({
    required super.id,
    required super.studentNumber,
    required super.firstName,
    required super.fullName,
    super.courseLabel,
    required super.yearLevel,
    super.section,
    super.schoolYear,
    super.semester,
    super.studentStatus,
    super.corStatus,
    super.profilePictureUrl,
  });

  factory ProfileSummaryModel.fromJson(Map<String, dynamic> json) {
    return ProfileSummaryModel(
      id: (json['id'] ?? '').toString(),
      studentNumber: (json['studentNumber'] ?? '').toString(),
      firstName: (json['firstName'] ?? '').toString(),
      fullName: (json['fullName'] ?? '').toString(),
      courseLabel: json['courseLabel']?.toString(),
      yearLevel: json['yearLevel'] is int ? json['yearLevel'] as int : int.tryParse('${json['yearLevel']}') ?? 1,
      section: json['section']?.toString(),
      schoolYear: json['schoolYear']?.toString(),
      semester: json['semester']?.toString(),
      studentStatus: json['studentStatus']?.toString(),
      corStatus: json['corStatus']?.toString(),
      profilePictureUrl: json['profilePictureUrl']?.toString(),
    );
  }
}

class AcademicSummaryModel extends AcademicSummary {
  const AcademicSummaryModel({
    required super.hasCurrentEnrollment,
    required super.enrolledSubjects,
    required super.totalUnits,
    super.semester,
    super.schoolYear,
    super.yearLevel,
    super.scheduleStatus,
  });

  factory AcademicSummaryModel.fromJson(Map<String, dynamic> json) {
    return AcademicSummaryModel(
      hasCurrentEnrollment: json['hasCurrentEnrollment'] == true,
      enrolledSubjects: json['enrolledSubjects'] is int ? json['enrolledSubjects'] as int : int.tryParse('${json['enrolledSubjects']}') ?? 0,
      totalUnits: (json['totalUnits'] as num?) ?? 0,
      semester: json['semester']?.toString(),
      schoolYear: json['schoolYear']?.toString(),
      yearLevel: json['yearLevel'] is int ? json['yearLevel'] as int : int.tryParse('${json['yearLevel']}'),
      scheduleStatus: json['scheduleStatus']?.toString(),
    );
  }
}

class UpcomingScheduleModel extends UpcomingSchedule {
  const UpcomingScheduleModel({
    required super.dayLabel,
    required super.classes,
  });

  factory UpcomingScheduleModel.fromJson(Map<String, dynamic> json) {
    return UpcomingScheduleModel(
      dayLabel: (json['dayLabel'] ?? '').toString(),
      classes: ((json['classes'] as List?) ?? [])
          .map((item) => ScheduleItemModel.fromJson((item as Map).cast<String, dynamic>()))
          .toList(),
    );
  }
}

class ScheduleItemModel extends ScheduleItemSummary {
  const ScheduleItemModel({
    required super.subjectCode,
    required super.subjectTitle,
    required super.room,
    required super.instructor,
    required super.startTime,
    required super.endTime,
  });

  factory ScheduleItemModel.fromJson(Map<String, dynamic> json) {
    return ScheduleItemModel(
      subjectCode: (json['subjectCode'] ?? '').toString(),
      subjectTitle: (json['subjectTitle'] ?? '').toString(),
      room: (json['room'] ?? 'TBA').toString(),
      instructor: (json['instructor'] ?? 'TBA').toString(),
      startTime: (json['startTime'] ?? '').toString(),
      endTime: (json['endTime'] ?? '').toString(),
    );
  }
}

class GradeSummaryModel extends GradeSummary {
  const GradeSummaryModel({
    required super.subjectCode,
    required super.subjectTitle,
    required super.units,
    required super.grade,
    required super.remarks,
    required super.status,
  });

  factory GradeSummaryModel.fromJson(Map<String, dynamic> json) {
    return GradeSummaryModel(
      subjectCode: (json['subjectCode'] ?? '').toString(),
      subjectTitle: (json['subjectTitle'] ?? '').toString(),
      units: (json['units'] as num?) ?? 0,
      grade: (json['grade'] as num?) ?? 0,
      remarks: (json['remarks'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
    );
  }
}

class AnnouncementTeaserModel extends AnnouncementTeaser {
  const AnnouncementTeaserModel({
    required super.id,
    required super.title,
    required super.message,
    required super.type,
    required super.isPinned,
    super.createdAt,
  });

  factory AnnouncementTeaserModel.fromJson(Map<String, dynamic> json) {
    return AnnouncementTeaserModel(
      id: (json['id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      message: (json['message'] ?? '').toString(),
      type: (json['type'] ?? 'info').toString(),
      isPinned: json['isPinned'] == true,
      createdAt: DateTime.tryParse('${json['createdAt']}'),
    );
  }
}

class DashboardSummaryModel extends DashboardSummary {
  const DashboardSummaryModel({
    required super.profile,
    required super.academicSummary,
    required super.todaySchedule,
    super.upcomingSchedule,
    required super.latestGrades,
    required super.announcements,
  });

  factory DashboardSummaryModel.fromJson(Map<String, dynamic> json) {
    return DashboardSummaryModel(
      profile: ProfileSummaryModel.fromJson((json['profile'] as Map?)?.cast<String, dynamic>() ?? {}),
      academicSummary: AcademicSummaryModel.fromJson((json['academicSummary'] as Map?)?.cast<String, dynamic>() ?? {}),
      todaySchedule: ((json['todaySchedule'] as List?) ?? [])
          .map((item) => ScheduleItemModel.fromJson((item as Map).cast<String, dynamic>()))
          .toList(),
      upcomingSchedule: json['upcomingSchedule'] is Map
          ? UpcomingScheduleModel.fromJson((json['upcomingSchedule'] as Map).cast<String, dynamic>())
          : null,
      latestGrades: ((json['latestGrades'] as List?) ?? [])
          .map((item) => GradeSummaryModel.fromJson((item as Map).cast<String, dynamic>()))
          .toList(),
      announcements: ((json['announcements'] as List?) ?? [])
          .map((item) => AnnouncementTeaserModel.fromJson((item as Map).cast<String, dynamic>()))
          .toList(),
    );
  }
}
