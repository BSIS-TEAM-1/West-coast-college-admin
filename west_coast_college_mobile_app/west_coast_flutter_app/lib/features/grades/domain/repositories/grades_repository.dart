import '../entities/grade_entities.dart';

abstract class GradesRepository {
  Future<GradesData> getGrades();
}
