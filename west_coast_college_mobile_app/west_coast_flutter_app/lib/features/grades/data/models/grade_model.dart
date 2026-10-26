import '../../domain/entities/grade_entities.dart';

class GradeEntryModel extends GradeEntry {
  const GradeEntryModel({
    super.subjectId,
    required super.subjectCode,
    required super.subjectTitle,
    required super.units,
    required super.grade,
    super.gradeMark,
    required super.remarks,
    required super.status,
    super.professorName,
    super.evaluationRequired,
    super.evaluationCompleted,
    super.canEvaluate,
    super.gradeLocked,
    super.lockReason,
  });

  factory GradeEntryModel.fromJson(Map<String, dynamic> json) {
    return GradeEntryModel(
      subjectId: json['subjectId']?.toString(),
      subjectCode: (json['subjectCode'] ?? json['code'] ?? '').toString(),
      subjectTitle: (json['subjectTitle'] ?? json['title'] ?? '').toString(),
      units: (json['units'] as num?) ?? 0,
      grade: (json['grade'] as num?) ?? 0,
      gradeMark: (json['gradeMark'] as String?)?.isNotEmpty == true ? json['gradeMark'] as String : null,
      remarks: (json['remarks'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      professorName: (json['professorName'] ?? json['instructor'] ?? 'Assigned Faculty').toString(),
      evaluationRequired: json['evaluationRequired'] != false,
      evaluationCompleted: json['evaluationCompleted'] == true,
      canEvaluate: json['canEvaluate'] != false,
      gradeLocked: json['gradeLocked'] == true,
      lockReason: json['lockReason']?.toString(),
    );
  }
}

class GradePeriodModel extends GradePeriod {
  const GradePeriodModel({
    required super.isCurrent,
    required super.semester,
    required super.schoolYear,
    super.yearLevel,
    super.termGpa,
    required super.totalUnits,
    super.gradesLocked,
    super.evaluationRequiredCount,
    super.evaluationCompletedCount,
    super.evaluationPendingCount,
    super.evaluationDeadlineDate,
    super.evaluationClosingTime,
    super.evaluationPeriodStatus,
    super.evaluationIsOpen,
    required super.subjects,
  });

  factory GradePeriodModel.fromJson(Map<String, dynamic> json) {
    final evalSummary = (json['evaluationSummary'] as Map?)?.cast<String, dynamic>() ?? {};
    final evalPeriod = (json['evaluationPeriod'] as Map?)?.cast<String, dynamic>() ?? {};
    final subjectsList = ((json['subjects'] as List?) ?? [])
        .map((item) => GradeEntryModel.fromJson((item as Map).cast<String, dynamic>()))
        .toList();

    return GradePeriodModel(
      isCurrent: json['isCurrent'] == true,
      semester: (json['semester'] ?? '').toString(),
      schoolYear: (json['schoolYear'] ?? '').toString(),
      yearLevel: json['yearLevel'] is int ? json['yearLevel'] as int : int.tryParse('${json['yearLevel']}'),
      termGpa: json['termGpa'] as num?,
      totalUnits: (json['totalUnits'] as num?) ?? 0,
      gradesLocked: json['gradesLocked'] == true || evalSummary['gradesLocked'] == true,
      evaluationRequiredCount: (evalSummary['requiredCount'] as num?)?.toInt() ?? subjectsList.length,
      evaluationCompletedCount: (evalSummary['completedCount'] as num?)?.toInt() ??
          subjectsList.where((s) => s.evaluationCompleted).length,
      evaluationPendingCount: (evalSummary['pendingCount'] as num?)?.toInt() ??
          subjectsList.where((s) => !s.evaluationCompleted).length,
      evaluationDeadlineDate: evalPeriod['deadlineDate']?.toString(),
      evaluationClosingTime: evalPeriod['closingTime']?.toString(),
      evaluationPeriodStatus: evalPeriod['status']?.toString(),
      evaluationIsOpen: evalPeriod['isOpen'] != false,
      subjects: subjectsList,
    );
  }
}

class GradeSummaryModel extends GradeSummary {
  const GradeSummaryModel({
    super.cumulativeGpa,
    required super.totalUnitsEarned,
    required super.totalSubjectsCompleted,
  });

  factory GradeSummaryModel.fromJson(Map<String, dynamic> json) {
    return GradeSummaryModel(
      cumulativeGpa: json['cumulativeGpa'] as num?,
      totalUnitsEarned: (json['totalUnitsEarned'] as num?) ?? 0,
      totalSubjectsCompleted: json['totalSubjectsCompleted'] is int
          ? json['totalSubjectsCompleted'] as int
          : int.tryParse('${json['totalSubjectsCompleted']}') ?? 0,
    );
  }
}

class GradesDataModel extends GradesData {
  const GradesDataModel({required super.periods, required super.summary});

  factory GradesDataModel.fromJson(Map<String, dynamic> json) {
    return GradesDataModel(
      periods: ((json['periods'] as List?) ?? [])
          .map((item) => GradePeriodModel.fromJson((item as Map).cast<String, dynamic>()))
          .toList(),
      summary: GradeSummaryModel.fromJson((json['summary'] as Map?)?.cast<String, dynamic>() ?? {}),
    );
  }
}
