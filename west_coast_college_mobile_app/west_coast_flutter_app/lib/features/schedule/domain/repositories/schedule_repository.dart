import '../entities/schedule_entities.dart';

abstract class ScheduleRepository {
  Future<WeeklySchedule> getWeeklySchedule();
}
