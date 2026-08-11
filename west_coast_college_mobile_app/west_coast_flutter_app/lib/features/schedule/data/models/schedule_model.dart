import '../../domain/entities/schedule_entities.dart';

class ScheduleClassModel extends ScheduleClass {
  const ScheduleClassModel({
    required super.subjectCode,
    required super.subjectTitle,
    required super.room,
    required super.instructor,
    required super.startTime,
    required super.endTime,
  });

  factory ScheduleClassModel.fromJson(Map<String, dynamic> json) {
    return ScheduleClassModel(
      subjectCode: (json['subjectCode'] ?? '').toString(),
      subjectTitle: (json['subjectTitle'] ?? '').toString(),
      room: (json['room'] ?? 'TBA').toString(),
      instructor: (json['instructor'] ?? 'TBA').toString(),
      startTime: (json['startTime'] ?? '').toString(),
      endTime: (json['endTime'] ?? '').toString(),
    );
  }
}

class WeeklyScheduleModel extends WeeklySchedule {
  const WeeklyScheduleModel({
    super.semester,
    super.schoolYear,
    super.yearLevel,
    required super.byDay,
  });

  factory WeeklyScheduleModel.fromJson(Map<String, dynamic> json) {
    final byDayRaw = (json['byDay'] as Map?)?.cast<String, dynamic>() ?? {};
    final byDay = <String, List<ScheduleClass>>{};
    for (final entry in byDayRaw.entries) {
      final list = entry.value is List ? entry.value as List : [];
      byDay[entry.key] = list
          .map((item) => ScheduleClassModel.fromJson((item as Map).cast<String, dynamic>()))
          .toList();
    }
    return WeeklyScheduleModel(
      semester: json['semester']?.toString(),
      schoolYear: json['schoolYear']?.toString(),
      yearLevel: json['yearLevel'] is int ? json['yearLevel'] as int : int.tryParse('${json['yearLevel']}'),
      byDay: byDay,
    );
  }
}
