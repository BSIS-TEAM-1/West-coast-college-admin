import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/error_state.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../../../shared/widgets/app_bottom_nav.dart';
import '../../domain/entities/announcement_entities.dart';
import '../providers/announcements_controller.dart';

class AnnouncementsPage extends ConsumerWidget {
  const AnnouncementsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(announcementsControllerProvider);
    final colors = ThemeColors.of(context);

    return Scaffold(
      backgroundColor: colors.backgroundSoft,
      appBar: AppBar(
        title: const Text('Announcements'),
        backgroundColor: colors.primary,
        foregroundColor: colors.onPrimary,
      ),
      body: _buildBody(context, ref, state, colors),
      bottomNavigationBar: const AppBottomNav(currentPath: '/announcements'),
    );
  }

  Widget _buildBody(BuildContext context, WidgetRef ref, AnnouncementsState state, ThemeColors colors) {
    return switch (state) {
      AnnouncementsLoading() => Center(child: CircularProgressIndicator(color: colors.primary)),
      AnnouncementsFailed(:final message) => Center(
          child: ErrorState(
            message: message,
            onRetry: () => ref.read(announcementsControllerProvider.notifier).load(),
          ),
        ),
      AnnouncementsLoaded(:final items, :final hasMore, :final isRefreshing) =>
        RefreshIndicator(
          onRefresh: () => ref.read(announcementsControllerProvider.notifier).refresh(),
          child: items.isEmpty
              ? ListView(
                  children: const [
                    EmptyState(
                      icon: Icons.campaign_outlined,
                      title: 'No announcements',
                      message: "There's nothing new right now. We'll notify you when something important comes up.",
                    ),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(AppDimensions.md),
                  itemCount: items.length + (hasMore ? 1 : 0),
                  separatorBuilder: (context, index) => const SizedBox(height: AppDimensions.sm),
                  itemBuilder: (context, index) {
                    if (index == items.length) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        ref.read(announcementsControllerProvider.notifier).loadMore();
                      });
                      return const Padding(
                        padding: EdgeInsets.all(AppDimensions.md),
                        child: Center(child: CircularProgressIndicator(color: _progressTint, strokeWidth: 2)),
                      );
                    }
                    if (isRefreshing && index == 0) {
                      return const LinearProgressIndicator(minHeight: 2, color: _progressTint);
                    }
                    return _AnnouncementTile(
                      announcement: items[index],
                      colors: colors,
                      onTap: () => _openDetail(context, items[index], colors),
                    );
                  },
                ),
        ),
    };
  }

  void _openDetail(BuildContext context, Announcement announcement, ThemeColors colors) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _AnnouncementDetailPage(announcement: announcement, colors: colors)),
    );
  }
}

const Color _progressTint = Color(0xFF4F46E5);

class _AnnouncementTile extends StatelessWidget {
  const _AnnouncementTile({required this.announcement, required this.colors, required this.onTap});
  final Announcement announcement;
  final ThemeColors colors;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
      child: Container(
        padding: const EdgeInsets.all(AppDimensions.md),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
          border: Border.all(color: colors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(_iconFor(announcement.type), size: AppDimensions.iconMedium, color: _colorFor(announcement.type, colors)),
            const SizedBox(width: AppDimensions.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (announcement.isPinned) ...[
                        Icon(Icons.push_pin, size: 12, color: colors.warning),
                        const SizedBox(width: 4),
                      ],
                      Expanded(
                        child: Text(
                          announcement.title,
                          style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600, color: colors.textPrimary),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    announcement.message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Row(
                    children: [
                      StatusBadge(label: announcement.categoryLabel, tone: _toneFor(announcement.type)),
                      const SizedBox(width: AppDimensions.sm),
                      if (announcement.createdAt != null)
                        Text(
                          DateFormat('MMM d, y').format(announcement.createdAt!),
                          style: AppTextStyles.caption.copyWith(color: colors.textMuted),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _iconFor(String type) => switch (type) {
        'urgent' => Icons.priority_high,
        'warning' => Icons.warning_amber_outlined,
        'maintenance' => Icons.build_outlined,
        _ => Icons.campaign_outlined,
      };

  Color _colorFor(String type, ThemeColors colors) => switch (type) {
        'urgent' => colors.error,
        'warning' => colors.warning,
        'maintenance' => colors.primary,
        _ => colors.primary,
      };

  StatusTone _toneFor(String type) => switch (type) {
        'urgent' => StatusTone.danger,
        'warning' => StatusTone.warning,
        'maintenance' => StatusTone.info,
        _ => StatusTone.neutral,
      };
}

class _AnnouncementDetailPage extends StatelessWidget {
  const _AnnouncementDetailPage({required this.announcement, required this.colors});
  final Announcement announcement;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: colors.background,
      appBar: AppBar(
        title: const Text('Announcement'),
        backgroundColor: colors.primary,
        foregroundColor: colors.onPrimary,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppDimensions.md),
        children: [
          if (announcement.isPinned)
            Row(
              children: [
                Icon(Icons.push_pin, size: 14, color: colors.warning),
                const SizedBox(width: 4),
                Text('Pinned', style: AppTextStyles.labelSmall.copyWith(color: colors.warning)),
              ],
            ),
          Text(announcement.title, style: AppTextStyles.headlineMedium.copyWith(color: colors.textBold)),
          const SizedBox(height: AppDimensions.xs),
          if (announcement.createdAt != null)
            Text(DateFormat('MMMM d, y • h:mm a').format(announcement.createdAt!), style: AppTextStyles.caption.copyWith(color: colors.textMuted)),
          const SizedBox(height: AppDimensions.md),
          Divider(color: colors.divider),
          const SizedBox(height: AppDimensions.md),
          Text(announcement.message, style: AppTextStyles.bodyMedium.copyWith(height: 1.6, color: colors.textPrimary)),
          for (final media in announcement.media) ...[
            const SizedBox(height: AppDimensions.md),
            if (media.type == 'image')
              ClipRRect(
                borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
                child: Image.network(media.url, fit: BoxFit.cover, errorBuilder: (context, error, stackTrace) => const SizedBox()),
              ),
            if (media.caption != null) ...[
              const SizedBox(height: AppDimensions.xs),
              Text(media.caption!, style: AppTextStyles.caption.copyWith(color: colors.textMuted)),
            ],
          ],
        ],
      ),
    );
  }
}
