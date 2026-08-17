class ProfileSummary {
  final String id;
  final String studentNumber;
  final String firstName;
  final String fullName;
  final String? courseLabel;
  final int yearLevel;
  final String? section;
  final String? schoolYear;
  final String? semester;
  final String? studentStatus;
  final String? corStatus;
  final String? profilePictureUrl;

  const ProfileSummary({
    required this.id,
    required this.studentNumber,
    required this.firstName,
    required this.fullName,
    this.courseLabel,
    required this.yearLevel,
    this.section,
    this.schoolYear,
    this.semester,
    this.studentStatus,
    this.corStatus,
    this.profilePictureUrl,
  });
}

class AcademicSummary {
  final bool hasCurrentEnrollment;
  final int enrolledSubjects;
  final num totalUnits;
  final String? semester;
  final String? schoolYear;
  final int? yearLevel;
  final String? scheduleStatus; // 'today' | 'none_today' | 'not_set'

  const AcademicSummary({
    required this.hasCurrentEnrollment,
    required this.enrolledSubjects,
    required this.totalUnits,
    this.semester,
    this.schoolYear,
    this.yearLevel,
    this.scheduleStatus,
  });
}

class ScheduleItemSummary {
  final String subjectCode;
  final String subjectTitle;
  final String room;
  final String instructor;
  final String startTime;
  final String endTime;

  const ScheduleItemSummary({
    required this.subjectCode,
    required this.subjectTitle,
    required this.room,
    required this.instructor,
    required this.startTime,
    required this.endTime,
  });
}

class GradeSummary {
  final String subjectCode;
  final String subjectTitle;
  final num units;
  final num grade;
  final String remarks;
  final String status;

  const GradeSummary({
    required this.subjectCode,
    required this.subjectTitle,
    required this.units,
    required this.grade,
    required this.remarks,
    required this.status,
  });

  bool get isPassed => grade <= 3.0;
}

class AnnouncementTeaser {
  final String id;
  final String title;
  final String message;
  final String type;
  final bool isPinned;
  final DateTime? createdAt;

  const AnnouncementTeaser({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    required this.isPinned,
    this.createdAt,
  });
}

class DashboardSummary {
  final ProfileSummary profile;
  final AcademicSummary academicSummary;
  final List<ScheduleItemSummary> todaySchedule;
  final UpcomingSchedule? upcomingSchedule;
  final List<GradeSummary> latestGrades;
  final List<AnnouncementTeaser> announcements;

  const DashboardSummary({
    required this.profile,
    required this.academicSummary,
    required this.todaySchedule,
    this.upcomingSchedule,
    required this.latestGrades,
    required this.announcements,
  });
}

class UpcomingSchedule {
  final String dayLabel;
  final List<ScheduleItemSummary> classes;

  const UpcomingSchedule({
    required this.dayLabel,
    required this.classes,
  });
}
