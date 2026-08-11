import '../entities/schedule_entities.dart';
import '../repositories/schedule_repository.dart';

class GetWeeklyScheduleUseCase {
  final ScheduleRepository _repository;
  const GetWeeklyScheduleUseCase(this._repository);

  Future<WeeklySchedule> call() => _repository.getWeeklySchedule();
}
