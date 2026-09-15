class GradeEntry {
  final String subjectCode;
  final String subjectTitle;
  final num units;
  final num grade;
  final String? gradeMark;
  final String remarks;
  final String status;

  const GradeEntry({
    required this.subjectCode,
    required this.subjectTitle,
    required this.units,
    required this.grade,
    this.gradeMark,
    required this.remarks,
    required this.status,
  });

  bool get isPassed => grade > 0 && grade <= 3.0;
  bool get isFailed => grade > 3.0;
  bool get isInProgress => status.toLowerCase() == 'in progress';
  bool get hasNoGrade => grade == 0 && gradeMark == null && remarks.isEmpty;
  bool get hasGradeMark => gradeMark != null && gradeMark!.isNotEmpty;

  /// Display string for the grade: numerical grade, grade mark, or em dash.
  String get displayGrade => hasGradeMark ? gradeMark! : (grade > 0 ? grade.toStringAsFixed(2) : '—');
}

class GradePeriod {
  final bool isCurrent;
  final String semester;
  final String schoolYear;
  final int? yearLevel;
  final num? termGpa;
  final num totalUnits;
  final List<GradeEntry> subjects;

  const GradePeriod({
    required this.isCurrent,
    required this.semester,
    required this.schoolYear,
    this.yearLevel,
    this.termGpa,
    required this.totalUnits,
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
