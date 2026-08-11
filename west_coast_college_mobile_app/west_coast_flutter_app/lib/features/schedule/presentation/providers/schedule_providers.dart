import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../data/datasources/schedule_remote_data_source.dart';
import '../../data/repositories/schedule_repository_impl.dart';
import '../../domain/repositories/schedule_repository.dart';
import '../../domain/usecases/get_weekly_schedule_usecase.dart';

final scheduleRemoteDataSourceProvider = Provider<ScheduleRemoteDataSource>((ref) {
  return ScheduleRemoteDataSource(ref.watch(apiClientProvider));
});

final scheduleRepositoryProvider = Provider<ScheduleRepository>((ref) {
  return ScheduleRepositoryImpl(ref.watch(scheduleRemoteDataSourceProvider));
});

final getWeeklyScheduleUseCaseProvider = Provider<GetWeeklyScheduleUseCase>((ref) {
  return GetWeeklyScheduleUseCase(ref.watch(scheduleRepositoryProvider));
});
