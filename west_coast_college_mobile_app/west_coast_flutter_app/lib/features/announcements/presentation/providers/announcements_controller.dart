import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/errors/failure.dart';
import '../../../../core/services/notification_service.dart';
import '../../domain/entities/announcement_entities.dart';
import '../../domain/usecases/get_announcements_usecase.dart';
import 'announcements_providers.dart';

sealed class AnnouncementsState {
  const AnnouncementsState();
}

class AnnouncementsLoading extends AnnouncementsState {
  const AnnouncementsLoading();
}

class AnnouncementsLoaded extends AnnouncementsState {
  final List<Announcement> items;
  final bool hasMore;
  final bool isLoadingMore;
  final bool isRefreshing;
  const AnnouncementsLoaded({
    required this.items,
    required this.hasMore,
    this.isLoadingMore = false,
    this.isRefreshing = false,
  });
}

class AnnouncementsFailed extends AnnouncementsState {
  final String message;
  const AnnouncementsFailed(this.message);
}

class AnnouncementsController extends StateNotifier<AnnouncementsState> {
  final GetAnnouncementsUseCase _getAnnouncements;
  final NotificationService _notificationService;
  int _offset = 0;
  static const int _pageSize = 20;
  bool _disposed = false;
  final Set<String> _seenAnnouncementIds = {};

  AnnouncementsController(this._getAnnouncements, this._notificationService)
      : super(const AnnouncementsLoading()) {
    load();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  Future<void> load() async {
    if (_disposed) return;
    state = const AnnouncementsLoading();
    _offset = 0;
    await _fetch(reset: true);
  }

  Future<void> refresh() async {
    if (_disposed) return;
    final current = state;
    if (current is AnnouncementsLoaded) {
      state = AnnouncementsLoaded(
        items: current.items,
        hasMore: current.hasMore,
        isRefreshing: true,
      );
    }
    _offset = 0;
    await _fetch(reset: true);
  }

  Future<void> loadMore() async {
    if (_disposed) return;
    final current = state;
    if (current is! AnnouncementsLoaded || current.isLoadingMore || !current.hasMore) return;

    state = AnnouncementsLoaded(
      items: current.items,
      hasMore: current.hasMore,
      isLoadingMore: true,
    );

    try {
      final result = await _getAnnouncements(limit: _pageSize, offset: _offset);
      _offset += result.items.length;
      if (!_disposed) {
        state = AnnouncementsLoaded(
          items: [...current.items, ...result.items],
          hasMore: result.hasMore,
        );
      }
    } catch (error) {
      // Revert to previous state on pagination failure.
      if (!_disposed) {
        state = AnnouncementsLoaded(items: current.items, hasMore: current.hasMore);
      }
    }
  }

  Future<void> _fetch({required bool reset}) async {
    if (_disposed) return;
    try {
      final result = await _getAnnouncements(limit: _pageSize, offset: reset ? 0 : _offset);
      if (reset) {
        _offset = result.items.length;
      } else {
        _offset += result.items.length;
      }
      if (!_disposed) {
        state = AnnouncementsLoaded(items: result.items, hasMore: result.hasMore);

        // Show notifications for new announcements (only on initial load or refresh)
        if (reset) {
          for (final announcement in result.items) {
            if (!_seenAnnouncementIds.contains(announcement.id)) {
              await _notificationService.showAnnouncement(
                title: announcement.title,
                message: announcement.message,
              );
              _seenAnnouncementIds.add(announcement.id);
            }
          }
        }
      }
    } catch (error) {
      if (!_disposed) {
        state = AnnouncementsFailed(mapExceptionToFailure(error).message);
      }
    }
  }
}

final announcementsControllerProvider =
    StateNotifierProvider.autoDispose<AnnouncementsController, AnnouncementsState>((ref) {
  return AnnouncementsController(
    ref.watch(getAnnouncementsUseCaseProvider),
    NotificationService(),
  );
});
