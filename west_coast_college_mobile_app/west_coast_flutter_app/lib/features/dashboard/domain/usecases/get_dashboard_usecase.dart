import '../entities/dashboard_entities.dart';
import '../repositories/dashboard_repository.dart';

class GetDashboardUseCase {
  final DashboardRepository _repository;
  const GetDashboardUseCase(this._repository);

  Future<DashboardSummary> call() => _repository.getDashboard();
}
