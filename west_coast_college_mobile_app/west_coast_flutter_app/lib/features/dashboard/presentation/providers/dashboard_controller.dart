import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/errors/failure.dart';
import '../../domain/entities/dashboard_entities.dart';
import '../../domain/usecases/get_dashboard_usecase.dart';
import 'dashboard_providers.dart';

/// Loading / Success / Empty / Error / Refreshing — modeled explicitly per
/// the UX spec rather than a bare AsyncValue, since "empty" (no current
/// enrollment) is a distinct, meaningful state here.
sealed class DashboardState {
  const DashboardState();
}

class DashboardLoading extends DashboardState {
  const DashboardLoading();
}

class DashboardLoaded extends DashboardState {
  final DashboardSummary summary;
  final bool isRefreshing;
  const DashboardLoaded(this.summary, {this.isRefreshing = false});
}

class DashboardFailed extends DashboardState {
  final String message;
  const DashboardFailed(this.message);
}

class DashboardController extends StateNotifier<DashboardState> {
  final GetDashboardUseCase _getDashboard;

  DashboardController(this._getDashboard) : super(const DashboardLoading()) {
    load();
  }

  Future<void> load() async {
    state = const DashboardLoading();
    await _fetch();
  }

  Future<void> refresh() async {
    final current = state;
    if (current is DashboardLoaded) {
      state = DashboardLoaded(current.summary, isRefreshing: true);
    }
    await _fetch();
  }

  Future<void> _fetch() async {
    try {
      final summary = await _getDashboard();
      state = DashboardLoaded(summary);
    } catch (error) {
      state = DashboardFailed(mapExceptionToFailure(error).message);
    }
  }
}

final dashboardControllerProvider = StateNotifierProvider.autoDispose<DashboardController, DashboardState>((ref) {
  return DashboardController(ref.watch(getDashboardUseCaseProvider));
});
