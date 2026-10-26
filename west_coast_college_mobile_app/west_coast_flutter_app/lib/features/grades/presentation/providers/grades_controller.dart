import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/errors/failure.dart';
import '../../../../core/services/notification_service.dart';
import '../../domain/entities/grade_entities.dart';
import '../../domain/usecases/get_grades_usecase.dart';
import 'grades_providers.dart';

sealed class GradesState {
  const GradesState();
}

class GradesLoading extends GradesState {
  const GradesLoading();
}

class GradesLoaded extends GradesState {
  final GradesData data;
  final bool isRefreshing;
  const GradesLoaded(this.data, {this.isRefreshing = false});
}

class GradesFailed extends GradesState {
  final String message;
  const GradesFailed(this.message);
}

class GradesController extends StateNotifier<GradesState> {
  final GetGradesUseCase _getGrades;
  final NotificationService _notificationService;
  final Set<String> _seenGradeIds = {};

  GradesController(this._getGrades, this._notificationService)
      : super(const GradesLoading()) {
    load();
  }

  Future<void> load() async {
    state = const GradesLoading();
    await _fetch();
  }

  Future<void> refresh() async {
    final current = state;
    if (current is GradesLoaded) {
      state = GradesLoaded(current.data, isRefreshing: true);
    }
    await _fetch();
  }

  Future<void> _fetch() async {
    try {
      final data = await _getGrades();
      final wasLocked = state is GradesLoaded
          ? (state as GradesLoaded).data.periods.any((p) => p.gradesLocked)
          : true;
      final isNowUnlocked = data.periods.any((p) => !p.gradesLocked);

      state = GradesLoaded(data);

      // Show notification if grades were previously locked and now unlocked
      if (wasLocked && isNowUnlocked) {
        await _notificationService.showAllGradesUnlocked();
      }

      // Show notifications for newly released grades
      for (final period in data.periods) {
        for (final subject in period.subjects) {
          if (!subject.gradeLocked && subject.grade > 0) {
            final gradeKey = '${period.schoolYear}-${period.semester}-${subject.subjectCode}';
            if (!_seenGradeIds.contains(gradeKey)) {
              await _notificationService.showGradeReleased(
                subjectCode: subject.subjectCode,
                grade: subject.displayGrade,
                remarks: subject.remarks,
              );
              _seenGradeIds.add(gradeKey);
            }
          }
        }
      }
    } catch (error) {
      state = GradesFailed(mapExceptionToFailure(error).message);
    }
  }
}

final gradesControllerProvider = StateNotifierProvider.autoDispose<GradesController, GradesState>((ref) {
  return GradesController(
    ref.watch(getGradesUseCaseProvider),
    NotificationService(),
  );
});
