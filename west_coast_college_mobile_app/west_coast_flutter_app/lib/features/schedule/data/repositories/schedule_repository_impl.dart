import '../../domain/entities/schedule_entities.dart';
import '../../domain/repositories/schedule_repository.dart';
import '../datasources/schedule_remote_data_source.dart';

class ScheduleRepositoryImpl implements ScheduleRepository {
  final ScheduleRemoteDataSource _remote;
  ScheduleRepositoryImpl(this._remote);

  @override
  Future<WeeklySchedule> getWeeklySchedule() => _remote.getWeeklySchedule();
}
