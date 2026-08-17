import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/error_state.dart';
import '../../../../core/widgets/loading_skeleton.dart';
import '../../../../core/widgets/section_header.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../../../core/widgets/student_avatar.dart';
import '../../../../shared/widgets/app_bottom_nav.dart';
import '../../domain/entities/dashboard_entities.dart';
import '../providers/dashboard_controller.dart';

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(dashboardControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundSoft,
      appBar: AppBar(
        title: Text('WCConnect', style: AppTextStyles.headlineMedium.copyWith(color: AppColors.onPrimary)),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        elevation: 0,
      ),
      body: SafeArea(child: _buildBody(context, ref, state)),
      bottomNavigationBar: const AppBottomNav(currentPath: '/dashboard'),
    );
  }

  Widget _buildBody(BuildContext context, WidgetRef ref, DashboardState state) {
    return switch (state) {
      DashboardLoading() => const DashboardSkeleton(),
      DashboardFailed(:final message) => Center(
          child: ErrorState(
            message: message,
            onRetry: () => ref.read(dashboardControllerProvider.notifier).load(),
          ),
        ),
      DashboardLoaded(:final summary, :final isRefreshing) => RefreshIndicator(
          onRefresh: () => ref.read(dashboardControllerProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(AppDimensions.md, AppDimensions.md, AppDimensions.md, AppDimensions.xl),
            children: [
              if (isRefreshing) const LinearProgressIndicator(minHeight: 2),
              _HeaderCard(profile: summary.profile),
              const SizedBox(height: AppDimensions.lg),
              _AcademicContextRow(academicSummary: summary.academicSummary),
              const SizedBox(height: AppDimensions.lg),
              SectionHeader(
                title: "Today's Schedule",
                actionLabel: 'View All',
                onAction: () => context.go('/schedule'),
              ),
              const SizedBox(height: AppDimensions.sm),
              _TodayScheduleSection(
                items: summary.todaySchedule,
                upcomingSchedule: summary.upcomingSchedule,
                scheduleStatus: summary.academicSummary.scheduleStatus,
              ),
              const SizedBox(height: AppDimensions.lg),
              SectionHeader(
                title: 'Latest Grades',
                actionLabel: 'View All',
                onAction: () => context.go('/grades'),
              ),
              const SizedBox(height: AppDimensions.sm),
              _LatestGradesSection(grades: summary.latestGrades),
              const SizedBox(height: AppDimensions.lg),
              SectionHeader(
                title: 'Announcements',
                actionLabel: 'View All',
                onAction: () => context.go('/announcements'),
              ),
              const SizedBox(height: AppDimensions.sm),
              _AnnouncementsSection(announcements: summary.announcements),
            ],
          ),
        ),
    };
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.profile});
  final ProfileSummary profile;

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');

    return Container(
      padding: const EdgeInsets.all(AppDimensions.cardPadding),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusLarge),
        boxShadow: const [BoxShadow(color: AppColors.shadow, blurRadius: 8, offset: Offset(0, 2))],
      ),
      child: Row(
        children: [
          StudentAvatar(
            name: profile.fullName.isEmpty ? profile.firstName : profile.fullName,
            photoUrl: profile.profilePictureUrl,
          ),
          const SizedBox(width: AppDimensions.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$greeting,', style: AppTextStyles.bodySmall.copyWith(color: AppColors.textMuted)),
                Text(
                  profile.firstName.isEmpty ? profile.fullName : profile.firstName,
                  style: AppTextStyles.titleLarge.copyWith(color: AppColors.textBold, fontSize: 18),
                ),
                const SizedBox(height: AppDimensions.xs),
                Wrap(
                  spacing: AppDimensions.xs,
                  runSpacing: AppDimensions.xs,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (profile.studentStatus != null) _statusBadge(profile.studentStatus!),
                    Text(
                      [
                        if (profile.courseLabel != null) profile.courseLabel,
                        'Year ${profile.yearLevel}',
                        if (profile.section != null) profile.section,
                      ].whereType<String>().join(' • '),
                      style: AppTextStyles.bodySmall.copyWith(color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusBadge(String status) {
    final tone = switch (status.toLowerCase()) {
      'enrolled' => StatusTone.success,
      'pending' => StatusTone.warning,
      _ => StatusTone.neutral,
    };
    return StatusBadge(label: status, tone: tone);
  }
}

class _AcademicContextRow extends StatelessWidget {
  const _AcademicContextRow({required this.academicSummary});
  final AcademicSummary academicSummary;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: AppDimensions.md, vertical: AppDimensions.sm),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              _metric('School Year', academicSummary.schoolYear ?? '—'),
              _divider(),
              _metric('Semester', academicSummary.semester ?? '—'),
              _divider(),
              _metric('Enrolled Subjects', '${academicSummary.enrolledSubjects}'),
              _divider(),
              _metric('Units', '${academicSummary.totalUnits}'),
            ],
          ),
        ),
        if (!academicSummary.hasCurrentEnrollment) ...[
          const SizedBox(height: AppDimensions.sm),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppDimensions.xs),
            child: Row(
              children: [
                const Icon(Icons.info_outline, color: AppColors.warning, size: AppDimensions.iconSmall),
                const SizedBox(width: AppDimensions.xs),
                Expanded(
                  child: Text(
                    'No active enrollment for this term. Contact the Registrar if this is unexpected.',
                    style: AppTextStyles.caption.copyWith(color: AppColors.textSecondary),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _divider() => Container(width: 1, height: 28, color: AppColors.divider);

  Widget _metric(String label, String value) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: AppTextStyles.titleLarge.copyWith(color: AppColors.textBold)),
          const SizedBox(height: 2),
          Text(label, style: AppTextStyles.caption, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _TodayScheduleSection extends StatelessWidget {
  const _TodayScheduleSection({
    required this.items,
    this.upcomingSchedule,
    this.scheduleStatus,
  });
  final List<ScheduleItemSummary> items;
  final UpcomingSchedule? upcomingSchedule;
  final String? scheduleStatus;

  @override
  Widget build(BuildContext context) {
    // Case 1: Schedules haven't been set by the registrar yet
    if (scheduleStatus == 'not_set') {
      return const EmptyState(
        icon: Icons.event_busy,
        title: 'Schedules not yet posted',
        message: 'Your subjects are enrolled but class schedules haven\'t been assigned yet. Check back later or contact the Registrar.',
      );
    }

    // Case 2: Today has classes — show them
    if (items.isNotEmpty) {
      return Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          children: [
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0) const Divider(height: 1, color: AppColors.divider),
              _ScheduleRow(item: items[i]),
            ],
          ],
        ),
      );
    }

    // Case 3: No classes today, but there are upcoming classes this week
    if (upcomingSchedule != null && upcomingSchedule!.classes.isNotEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppDimensions.md,
              vertical: AppDimensions.sm,
            ),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.wb_sunny_outlined, size: AppDimensions.iconSmall, color: AppColors.textMuted),
                    const SizedBox(width: AppDimensions.xs),
                    Text(
                      'No classes today — next class on ${_dayLabel(upcomingSchedule!.dayLabel)}',
                      style: AppTextStyles.bodySmall.copyWith(color: AppColors.textSecondary),
                    ),
                  ],
                ),
                const SizedBox(height: AppDimensions.sm),
                for (var i = 0; i < upcomingSchedule!.classes.length; i++) ...[
                  if (i > 0) const Divider(height: 1, color: AppColors.divider),
                  _ScheduleRow(item: upcomingSchedule!.classes[i]),
                ],
              ],
            ),
          ),
        ],
      );
    }

    // Case 4: No classes today and no upcoming classes found
    return const EmptyState(
      icon: Icons.event_available_outlined,
      title: 'No classes today',
      message: 'Enjoy your day off — check "View All" for your full weekly schedule.',
    );
  }

  String _dayLabel(String code) {
    return switch (code) {
      'M' => 'Monday',
      'T' => 'Tuesday',
      'W' => 'Wednesday',
      'TH' => 'Thursday',
      'F' => 'Friday',
      'S' => 'Saturday',
      'SU' => 'Sunday',
      _ => code,
    };
  }
}

class _ScheduleRow extends StatelessWidget {
  const _ScheduleRow({required this.item});
  final ScheduleItemSummary item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppDimensions.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 68,
            child: Text(item.startTime, style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${item.subjectCode} — ${item.subjectTitle}', style: AppTextStyles.bodyMedium),
                const SizedBox(height: 2),
                Text('${item.room} • ${item.instructor}', style: AppTextStyles.caption),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LatestGradesSection extends StatelessWidget {
  const _LatestGradesSection({required this.grades});
  final List<GradeSummary> grades;

  @override
  Widget build(BuildContext context) {
    if (grades.isEmpty) {
      return const EmptyState(
        icon: Icons.grade_outlined,
        title: 'No grades available',
        message: "Your grades haven't been posted yet. Check back once your professors submit them.",
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < grades.length; i++) ...[
            if (i > 0) const Divider(height: 1, color: AppColors.divider),
            _GradeRow(grade: grades[i]),
          ],
        ],
      ),
    );
  }
}

class _GradeRow extends StatelessWidget {
  const _GradeRow({required this.grade});
  final GradeSummary grade;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppDimensions.md),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${grade.subjectCode} — ${grade.subjectTitle}', style: AppTextStyles.bodyMedium),
                const SizedBox(height: 2),
                Text('${grade.units} units', style: AppTextStyles.caption),
              ],
            ),
          ),
          const SizedBox(width: AppDimensions.sm),
          Text(
            grade.grade.toStringAsFixed(2),
            style: AppTextStyles.titleLarge.copyWith(color: AppColors.textBold),
          ),
          const SizedBox(width: AppDimensions.sm),
          StatusBadge(
            label: grade.remarks,
            tone: grade.isPassed ? StatusTone.success : StatusTone.danger,
          ),
        ],
      ),
    );
  }
}

class _AnnouncementsSection extends StatelessWidget {
  const _AnnouncementsSection({required this.announcements});
  final List<AnnouncementTeaser> announcements;

  @override
  Widget build(BuildContext context) {
    if (announcements.isEmpty) {
      return const EmptyState(
        icon: Icons.campaign_outlined,
        title: 'No announcements',
        message: "There's nothing new right now. We'll notify you when something important comes up.",
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < announcements.length; i++) ...[
            if (i > 0) const Divider(height: 1, color: AppColors.divider),
            _AnnouncementRow(announcement: announcements[i]),
          ],
        ],
      ),
    );
  }
}

class _AnnouncementRow extends StatelessWidget {
  const _AnnouncementRow({required this.announcement});
  final AnnouncementTeaser announcement;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppDimensions.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(_iconFor(announcement.type), size: AppDimensions.iconMedium, color: _colorFor(announcement.type)),
          const SizedBox(width: AppDimensions.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (announcement.isPinned) ...[
                      const Icon(Icons.push_pin, size: 12, color: AppColors.warning),
                      const SizedBox(width: 4),
                    ],
                    Expanded(
                      child: Text(
                        announcement.title,
                        style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  announcement.message,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.bodySmall.copyWith(color: AppColors.textMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData _iconFor(String type) => switch (type) {
        'urgent' => Icons.priority_high,
        'warning' => Icons.warning_amber_outlined,
        'maintenance' => Icons.build_outlined,
        _ => Icons.campaign_outlined,
      };

  Color _colorFor(String type) => switch (type) {
        'urgent' => AppColors.error,
        'warning' => AppColors.warning,
        'maintenance' => AppColors.maintenance,
        _ => AppColors.primary,
      };
}
