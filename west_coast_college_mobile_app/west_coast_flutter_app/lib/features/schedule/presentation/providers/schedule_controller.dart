import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/errors/failure.dart';
import '../../domain/entities/schedule_entities.dart';
import '../../domain/usecases/get_weekly_schedule_usecase.dart';
import 'schedule_providers.dart';

sealed class ScheduleState {
  const ScheduleState();
}

class ScheduleLoading extends ScheduleState {
  const ScheduleLoading();
}

class ScheduleLoaded extends ScheduleState {
  final WeeklySchedule schedule;
  final bool isRefreshing;
  const ScheduleLoaded(this.schedule, {this.isRefreshing = false});
}

class ScheduleFailed extends ScheduleState {
  final String message;
  const ScheduleFailed(this.message);
}

class ScheduleController extends StateNotifier<ScheduleState> {
  final GetWeeklyScheduleUseCase _getSchedule;

  ScheduleController(this._getSchedule) : super(const ScheduleLoading()) {
    load();
  }

  Future<void> load() async {
    state = const ScheduleLoading();
    await _fetch();
  }

  Future<void> refresh() async {
    final current = state;
    if (current is ScheduleLoaded) {
      state = ScheduleLoaded(current.schedule, isRefreshing: true);
    }
    await _fetch();
  }

  Future<void> _fetch() async {
    try {
      final schedule = await _getSchedule();
      state = ScheduleLoaded(schedule);
    } catch (error) {
      state = ScheduleFailed(mapExceptionToFailure(error).message);
    }
  }
}

final scheduleControllerProvider = StateNotifierProvider.autoDispose<ScheduleController, ScheduleState>((ref) {
  return ScheduleController(ref.watch(getWeeklyScheduleUseCaseProvider));
});
