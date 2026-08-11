import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/errors/failure.dart';
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

  GradesController(this._getGrades) : super(const GradesLoading()) {
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
      state = GradesLoaded(data);
    } catch (error) {
      state = GradesFailed(mapExceptionToFailure(error).message);
    }
  }
}

final gradesControllerProvider = StateNotifierProvider.autoDispose<GradesController, GradesState>((ref) {
  return GradesController(ref.watch(getGradesUseCaseProvider));
});
