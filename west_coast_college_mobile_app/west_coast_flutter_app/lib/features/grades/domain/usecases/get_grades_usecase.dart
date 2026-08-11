import '../entities/grade_entities.dart';
import '../repositories/grades_repository.dart';

class GetGradesUseCase {
  final GradesRepository _repository;
  const GetGradesUseCase(this._repository);

  Future<GradesData> call() => _repository.getGrades();
}
