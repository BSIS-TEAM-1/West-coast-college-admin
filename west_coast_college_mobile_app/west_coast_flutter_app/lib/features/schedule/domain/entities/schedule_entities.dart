class ScheduleClass {
  final String subjectCode;
  final String subjectTitle;
  final String room;
  final String instructor;
  final String startTime;
  final String endTime;

  const ScheduleClass({
    required this.subjectCode,
    required this.subjectTitle,
    required this.room,
    required this.instructor,
    required this.startTime,
    required this.endTime,
  });
}

class WeeklySchedule {
  final String? semester;
  final String? schoolYear;
  final int? yearLevel;
  final Map<String, List<ScheduleClass>> byDay;

  const WeeklySchedule({
    this.semester,
    this.schoolYear,
    this.yearLevel,
    required this.byDay,
  });

  List<String> get dayOrder => const ['M', 'T', 'W', 'TH', 'F', 'S', 'SU'];

  String dayLabel(String code) => switch (code) {
        'M' => 'Monday',
        'T' => 'Tuesday',
        'W' => 'Wednesday',
        'TH' => 'Thursday',
        'F' => 'Friday',
        'S' => 'Saturday',
        'SU' => 'Sunday',
        _ => code,
      };

  List<ScheduleClass> classesFor(String dayCode) => byDay[dayCode] ?? const [];

  bool get isEmpty => byDay.values.every((classes) => classes.isEmpty);
}
