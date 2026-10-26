import '../../../../core/utils/grade_format.dart';

class GradeEntry {
  final String? subjectId;
  final String subjectCode;
  final String subjectTitle;
  final num units;
  final num grade;
  final String? gradeMark;
  final String remarks;
  final String status;
  final String professorName;
  final bool evaluationRequired;
  final bool evaluationCompleted;
  final bool canEvaluate;
  final bool gradeLocked;
  final String? lockReason;

  const GradeEntry({
    this.subjectId,
    required this.subjectCode,
    required this.subjectTitle,
    required this.units,
    required this.grade,
    this.gradeMark,
    required this.remarks,
    required this.status,
    this.professorName = 'Assigned Faculty',
    this.evaluationRequired = true,
    this.evaluationCompleted = false,
    this.canEvaluate = true,
    this.gradeLocked = false,
    this.lockReason,
  });

  bool get isPassed => !gradeLocked && grade > 0 && grade <= 3.0;
  bool get isFailed => !gradeLocked && grade > 3.0;
  bool get isInProgress => status.toLowerCase() == 'in progress';
  bool get hasNoGrade => !gradeLocked && grade == 0 && gradeMark == null && remarks.isEmpty;
  bool get hasGradeMark => !gradeLocked && gradeMark != null && gradeMark!.isNotEmpty;

  /// Display string for the grade: Locked label when locked, numerical grade, grade mark, or em dash.
  String get displayGrade {
    if (gradeLocked) return 'Locked';
    return hasGradeMark ? gradeMark! : formatGrade(grade);
  }
}

class GradePeriod {
  final bool isCurrent;
  final String semester;
  final String schoolYear;
  final int? yearLevel;
  final num? termGpa;
  final num totalUnits;
  final bool gradesLocked;
  final int evaluationRequiredCount;
  final int evaluationCompletedCount;
  final int evaluationPendingCount;
  final String? evaluationDeadlineDate;
  final String? evaluationClosingTime;
  final String? evaluationPeriodStatus;
  final bool evaluationIsOpen;
  final List<GradeEntry> subjects;

  const GradePeriod({
    required this.isCurrent,
    required this.semester,
    required this.schoolYear,
    this.yearLevel,
    this.termGpa,
    required this.totalUnits,
    this.gradesLocked = false,
    this.evaluationRequiredCount = 0,
    this.evaluationCompletedCount = 0,
    this.evaluationPendingCount = 0,
    this.evaluationDeadlineDate,
    this.evaluationClosingTime,
    this.evaluationPeriodStatus,
    this.evaluationIsOpen = true,
    required this.subjects,
  });

  String get label => '$schoolYear — $semester Semester${isCurrent ? ' (Current)' : ''}';
}

class GradeSummary {
  final num? cumulativeGpa;
  final num totalUnitsEarned;
  final int totalSubjectsCompleted;

  const GradeSummary({
    this.cumulativeGpa,
    required this.totalUnitsEarned,
    required this.totalSubjectsCompleted,
  });
}

class GradesData {
  final List<GradePeriod> periods;
  final GradeSummary summary;

  const GradesData({required this.periods, required this.summary});
}
