import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../data/datasources/announcements_remote_data_source.dart';
import '../../data/repositories/announcements_repository_impl.dart';
import '../../domain/repositories/announcements_repository.dart';
import '../../domain/usecases/get_announcements_usecase.dart';

final announcementsRemoteDataSourceProvider = Provider<AnnouncementsRemoteDataSource>((ref) {
  return AnnouncementsRemoteDataSource(ref.watch(apiClientProvider));
});

final announcementsRepositoryProvider = Provider<AnnouncementsRepository>((ref) {
  return AnnouncementsRepositoryImpl(ref.watch(announcementsRemoteDataSourceProvider));
});

final getAnnouncementsUseCaseProvider = Provider<GetAnnouncementsUseCase>((ref) {
  return GetAnnouncementsUseCase(ref.watch(announcementsRepositoryProvider));
});
