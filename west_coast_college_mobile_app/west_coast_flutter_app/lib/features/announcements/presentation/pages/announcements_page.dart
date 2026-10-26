import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/animations/entrance.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
import '../../../../core/widgets/depth.dart';
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
    final colors = ThemeColors.of(context);    return Scaffold(
      backgroundColor: colors.backgroundSoft,
      appBar: AppBar(
        title: const Text('Announcements'),
        backgroundColor: AppColors.primary,
        foregroundColor: colors.onPrimary,
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.primaryHover, AppColors.primary],
            ),
          ),
        ),
        leading: Padding(
          padding: const EdgeInsets.only(left: AppDimensions.md),
          child: Center(
            child: DepthIconTile(
              icon: Icons.campaign_rounded,
              tone: DepthTone.gold,
              size: 36,
              radius: 11,
            ),
          ),
        ),
      ),
      body: _buildBody(context, ref, state, colors),
      bottomNavigationBar: const AppBottomNav(currentPath: '/announcements'),
    );
  }

  Widget _buildBody(BuildContext context, WidgetRef ref, AnnouncementsState state, ThemeColors colors) {
    return switch (state) {
      AnnouncementsLoading() => Center(child: CircularProgressIndicator(color: colors.textBold)),
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
              : NotificationListener<ScrollNotification>(
                  onNotification: (notification) {
                    if (notification is ScrollEndNotification && 
                        notification.metrics.pixels >= notification.metrics.maxScrollExtent - 200 &&
                        hasMore && 
                        !isRefreshing) {
                      ref.read(announcementsControllerProvider.notifier).loadMore();
                    }
                    return false;
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.all(AppDimensions.md),
                    itemCount: items.length + (isRefreshing && hasMore ? 1 : 0),
                    separatorBuilder: (context, index) => const SizedBox(height: AppDimensions.sm),
                    itemBuilder: (context, index) {
                      if (index == items.length && isRefreshing && hasMore) {
                        return const Padding(
                          padding: EdgeInsets.all(AppDimensions.md),
                          child: Center(child: CircularProgressIndicator(color: _progressTint, strokeWidth: 2)),
                        );
                      }
                      // NOTE: no top LinearProgressIndicator here — the
                      // footer spinner is the single scroll-loading indicator;
                      // adding a top bar showed two loaders at once.
                      return Entrance(
                        order: index < 6 ? index : 0,
                        delayMs: 45,
                        child: _AnnouncementTile(
                          announcement: items[index],
                          colors: colors,
                          onTap: () => _openDetail(context, items[index], colors),
                        ),
                      );
                    },
                  ),
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

const Color _progressTint = Color(0xFFD6AF52);

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
            DepthIconTile(
              icon: _iconFor(announcement.type),
              tint: _colorFor(announcement.type, colors, Theme.of(context).brightness == Brightness.dark),
              size: 40,
              radius: 12,
            ),
            const SizedBox(width: AppDimensions.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (announcement.isPinned) ...[
                        // Gold marks pinned/highlighted announcements.
                        Icon(Icons.push_pin, size: 12, color: colors.gold),
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

  // The general-announcement tile is filled with textBold in light mode — a
  // deep navy that reads as a neutral chip. In dark mode textBold becomes a
  // near-white, which would glare as a white chip behind a white icon, so the
  // fill swaps to the dark surface tone instead (the icon stays white).
  Color _colorFor(String type, ThemeColors colors, bool isDark) => switch (type) {
        'urgent' => colors.error,
        'warning' => colors.warning,
        'maintenance' => colors.maintenance,
        _ => isDark ? colors.surfaceVariant : colors.textBold,
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
                Icon(Icons.push_pin, size: 14, color: colors.gold),
                const SizedBox(width: 4),
                Text('Pinned', style: AppTextStyles.labelSmall.copyWith(color: colors.gold)),
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
              _AnnouncementImage(url: media.url),
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

class _AnnouncementImage extends StatelessWidget {
  const _AnnouncementImage({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    final image = _buildImage();
    if (image == null) return const SizedBox();

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
      child: image,
    );
  }

  Widget? _buildImage() {
    if (url.startsWith('data:image/')) {
      final commaIndex = url.indexOf(',');
      if (commaIndex < 0) return null;

      try {
        return Image.memory(
          base64Decode(url.substring(commaIndex + 1)),
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) => const SizedBox(),
        );
      } on FormatException {
        return null;
      }
    }

    if (url.isEmpty) return null;
    return Image.network(
      url,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => const SizedBox(),
    );
  }
}
