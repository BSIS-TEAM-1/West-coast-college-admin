import '../../domain/entities/grade_entities.dart';
import '../../domain/repositories/grades_repository.dart';
import '../datasources/grades_remote_data_source.dart';

class GradesRepositoryImpl implements GradesRepository {
  final GradesRemoteDataSource _remote;
  GradesRepositoryImpl(this._remote);

  @override
  Future<GradesData> getGrades() => _remote.getGrades();
}
