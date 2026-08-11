import '../../domain/entities/grade_entities.dart';

class GradeEntryModel extends GradeEntry {
  const GradeEntryModel({
    required super.subjectCode,
    required super.subjectTitle,
    required super.units,
    required super.grade,
    required super.remarks,
    required super.status,
  });

  factory GradeEntryModel.fromJson(Map<String, dynamic> json) {
    return GradeEntryModel(
      subjectCode: (json['subjectCode'] ?? '').toString(),
      subjectTitle: (json['subjectTitle'] ?? '').toString(),
      units: (json['units'] as num?) ?? 0,
      grade: (json['grade'] as num?) ?? 0,
      remarks: (json['remarks'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
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
    required super.subjects,
  });

  factory GradePeriodModel.fromJson(Map<String, dynamic> json) {
    return GradePeriodModel(
      isCurrent: json['isCurrent'] == true,
      semester: (json['semester'] ?? '').toString(),
      schoolYear: (json['schoolYear'] ?? '').toString(),
      yearLevel: json['yearLevel'] is int ? json['yearLevel'] as int : int.tryParse('${json['yearLevel']}'),
      termGpa: json['termGpa'] as num?,
      totalUnits: (json['totalUnits'] as num?) ?? 0,
      subjects: ((json['subjects'] as List?) ?? [])
          .map((item) => GradeEntryModel.fromJson((item as Map).cast<String, dynamic>()))
          .toList(),
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
