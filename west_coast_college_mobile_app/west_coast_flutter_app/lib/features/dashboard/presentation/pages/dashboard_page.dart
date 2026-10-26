import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/animations/entrance.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
import '../../../../core/utils/grade_format.dart';
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
    final colors = ThemeColors.of(context);

    return Scaffold(
      backgroundColor: colors.backgroundSoft,
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
      DashboardLoaded(:final summary) => RefreshIndicator(
          onRefresh: () => ref.read(dashboardControllerProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(AppDimensions.md, AppDimensions.md, AppDimensions.md, AppDimensions.xl),
            // NOTE: no extra progress bar here — the RefreshIndicator's own
            // spinner is the one and only pull-to-refresh indicator. A
            // top LinearProgressIndicator used to run alongside it, showing
            // two loaders at once while scrolling/refreshing.
            children: [
              Entrance(child: _HeaderCard(profile: summary.profile, academicSummary: summary.academicSummary)),
              if (summary.enrolledSubjects.isNotEmpty) ...[
                Entrance(
                  order: 1,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: AppDimensions.lg),
                      SectionHeader(
                        title: 'My Subjects',
                        actionLabel: 'View Grades',
                        onAction: () => context.go('/grades'),
                      ),
                      const SizedBox(height: AppDimensions.sm),
                      _EnrolledSubjectsSection(subjects: summary.enrolledSubjects),
                    ],
                  ),
                ),
              ],
              Entrance(
                order: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
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
                  ],
                ),
              ),
              Entrance(
                order: 3,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: AppDimensions.lg),
                    SectionHeader(
                      title: 'Latest Grades',
                      actionLabel: 'View All',
                      onAction: () => context.go('/grades'),
                    ),
                    const SizedBox(height: AppDimensions.sm),
                    _LatestGradesSection(grades: summary.latestGrades),
                  ],
                ),
              ),
              Entrance(
                order: 4,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
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
            ],
          ),
        ),
    };
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.profile, required this.academicSummary});
  final ProfileSummary profile;
  final AcademicSummary academicSummary;

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');

    return Container(
      padding: const EdgeInsets.all(AppDimensions.cardPadding),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primaryHover, AppColors.primary],
        ),
        borderRadius: BorderRadius.circular(AppDimensions.radiusLarge),
        border: Border.all(color: Colors.white.withValues(alpha: .08)),
        boxShadow: [
          BoxShadow(
            color: AppColors.shadow.withValues(alpha: .28),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
          BoxShadow(
            color: Colors.white.withValues(alpha: .05),
            blurRadius: 2,
            offset: const Offset(0, -1),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Rim-lit avatar: a gold ring reads as edge light on the raised chip.
              DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.goldLight.withValues(alpha: .7), width: 2),
              boxShadow: [
                BoxShadow(
                  color: AppColors.goldLight.withValues(alpha: .25),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.all(2),
              child: StudentAvatar(
                name: profile.fullName.isEmpty ? profile.firstName : profile.fullName,
                photoUrl: profile.profilePictureUrl,
              ),
            ),
          ),
          const SizedBox(width: AppDimensions.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$greeting,', style: AppTextStyles.bodySmall.copyWith(color: AppColors.goldLight)),
                Text(
                  profile.firstName.isEmpty ? profile.fullName : profile.firstName,
                  style: AppTextStyles.titleLarge.copyWith(color: Colors.white, fontSize: 18),
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
                      style: AppTextStyles.bodySmall.copyWith(color: Colors.white.withValues(alpha: .72)),
                    ),
                  ],
                ),
              ],
            ),
          ),
            ],
          ),
          const SizedBox(height: AppDimensions.md),
          Container(height: 1, color: Colors.white.withValues(alpha: .10)),
          const SizedBox(height: AppDimensions.md),
          // Term overview kept inside the same hero (one raised surface,
          // less nesting). A 2×2 grid so values like '2025–2026' are never
          // squeezed into four-across columns on narrow screens.
          Row(
            children: [
              Expanded(child: _HeroStat('School Year', academicSummary.schoolYear ?? '—')),
              const SizedBox(width: AppDimensions.md),
              Expanded(child: _HeroStat('Semester', academicSummary.semester ?? '—')),
            ],
          ),
          const SizedBox(height: AppDimensions.sm),
          Row(
            children: [
              Expanded(child: _HeroStat('Subjects', '${academicSummary.enrolledSubjects}')),
              const SizedBox(width: AppDimensions.md),
              Expanded(child: _HeroStat('Units', '${academicSummary.totalUnits}')),
            ],
          ),
          if (!academicSummary.hasCurrentEnrollment) ...[
            const SizedBox(height: AppDimensions.md),
            Container(height: 1, color: Colors.white.withValues(alpha: .10)),
            const SizedBox(height: AppDimensions.sm),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: AppColors.goldLight, size: AppDimensions.iconSmall),
                const SizedBox(width: AppDimensions.xs),
                Expanded(
                  child: Text(
                    'No active enrollment for this term. Contact the Registrar if this is unexpected.',
                    style: AppTextStyles.bodySmall.copyWith(color: Colors.white.withValues(alpha: .85)),
                  ),
                ),
              ],
            ),
          ],
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


/// One quiet stat inside the navy hero: small gold label, white value.
class _HeroStat extends StatelessWidget {
  const _HeroStat(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTextStyles.caption.copyWith(
            color: AppColors.goldLight.withValues(alpha: .95),
            fontWeight: FontWeight.w700,
            letterSpacing: .5,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTextStyles.titleMedium.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: 15,
          ),
        ),
      ],
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
    final colors = ThemeColors.of(context);
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
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
          border: Border.all(color: colors.border),
        ),
        child: Column(
          children: [
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0) Divider(height: 1, color: colors.divider),
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
              color: colors.surface,
              borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
              border: Border.all(color: colors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.wb_sunny_outlined, size: AppDimensions.iconSmall, color: colors.textMuted),
                    const SizedBox(width: AppDimensions.xs),
                    Text(
                      'No classes today — next class on ${_dayLabel(upcomingSchedule!.dayLabel)}',
                      style: AppTextStyles.bodySmall.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
                const SizedBox(height: AppDimensions.sm),
                for (var i = 0; i < upcomingSchedule!.classes.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: colors.divider),
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
    final colors = ThemeColors.of(context);
    return Padding(
      padding: const EdgeInsets.all(AppDimensions.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 80,
            child: Text(
              item.startTime,
              style: AppTextStyles.headlineSmall.copyWith(
                color: colors.textBold,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${item.subjectCode} — ${item.subjectTitle}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.titleSmall.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${item.room} • ${item.instructor}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.bodySmall.copyWith(
                    color: colors.textSecondary,
                    fontSize: 12.5,
                  ),
                ),
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
    final colors = ThemeColors.of(context);
    if (grades.isEmpty) {
      return const EmptyState(
        icon: Icons.grade_outlined,
        title: 'No grades available',
        message: "Your grades haven't been posted yet. Check back once your professors submit them.",
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < grades.length; i++) ...[
            if (i > 0) Divider(height: 1, color: colors.divider),
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
    final colors = ThemeColors.of(context);
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
                Text('${grade.units} units', style: AppTextStyles.caption.copyWith(color: colors.textMuted)),
              ],
            ),
          ),
          const SizedBox(width: AppDimensions.sm),
          Text(
            formatGrade(grade.grade),
            style: AppTextStyles.titleLarge.copyWith(color: colors.textBold),
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

class _EnrolledSubjectsSection extends StatelessWidget {
  const _EnrolledSubjectsSection({required this.subjects});
  final List<EnrolledSubject> subjects;

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < subjects.length; i++) ...[
            if (i > 0) Divider(height: 1, color: colors.divider),
            _EnrolledSubjectRow(subject: subjects[i]),
          ],
        ],
      ),
    );
  }
}

class _EnrolledSubjectRow extends StatelessWidget {
  const _EnrolledSubjectRow({required this.subject});
  final EnrolledSubject subject;

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    return Padding(
      padding: const EdgeInsets.all(AppDimensions.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${subject.subjectCode} — ${subject.subjectTitle}',
                  style: AppTextStyles.bodyMedium,
                ),
                const SizedBox(height: 2),
                Text(
                  '${subject.units} units • ${subject.instructor}',
                  style: AppTextStyles.caption.copyWith(color: colors.textMuted),
                ),
                if (subject.schedule != 'TBA') ...[
                  const SizedBox(height: 2),
                  Text(
                    '${subject.schedule} • ${subject.room}',
                    style: AppTextStyles.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: AppDimensions.sm),
          _buildTrailing(colors),
        ],
      ),
    );
  }

  Widget _buildTrailing(ThemeColors colors) {
    if (subject.hasGrade && subject.grade != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            formatGrade(subject.grade),
            style: AppTextStyles.titleLarge.copyWith(color: colors.textBold),
          ),
          const SizedBox(height: 2),
          StatusBadge(
            label: subject.isPassed ? 'PASSED' : 'FAILED',
            tone: subject.isPassed ? StatusTone.success : StatusTone.danger,
          ),
        ],
      );
    }
    return StatusBadge(
      label: subject.subjectStatus,
      tone: StatusTone.neutral,
    );
  }
}

class _AnnouncementsSection extends StatelessWidget {
  const _AnnouncementsSection({required this.announcements});
  final List<AnnouncementTeaser> announcements;

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    if (announcements.isEmpty) {
      return const EmptyState(
        icon: Icons.campaign_outlined,
        title: 'No announcements',
        message: "There's nothing new right now. We'll notify you when something important comes up.",
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < announcements.length; i++) ...[
            if (i > 0) Divider(height: 1, color: colors.divider),
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
    final colors = ThemeColors.of(context);
    return Padding(
      padding: const EdgeInsets.all(AppDimensions.md),
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
                  style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted),
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

  Color _colorFor(String type, ThemeColors colors) => switch (type) {
        'urgent' => colors.error,
        'warning' => colors.warning,
        'maintenance' => colors.maintenance,
        _ => colors.textBold,
      };
}
