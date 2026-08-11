import '../entities/dashboard_entities.dart';

abstract class DashboardRepository {
  Future<DashboardSummary> getDashboard();
}
