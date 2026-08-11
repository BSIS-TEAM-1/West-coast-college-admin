import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../data/datasources/grades_remote_data_source.dart';
import '../../data/repositories/grades_repository_impl.dart';
import '../../domain/repositories/grades_repository.dart';
import '../../domain/usecases/get_grades_usecase.dart';

final gradesRemoteDataSourceProvider = Provider<GradesRemoteDataSource>((ref) {
  return GradesRemoteDataSource(ref.watch(apiClientProvider));
});

final gradesRepositoryProvider = Provider<GradesRepository>((ref) {
  return GradesRepositoryImpl(ref.watch(gradesRemoteDataSourceProvider));
});

final getGradesUseCaseProvider = Provider<GetGradesUseCase>((ref) {
  return GetGradesUseCase(ref.watch(gradesRepositoryProvider));
});
