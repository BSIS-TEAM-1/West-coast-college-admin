import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/error_state.dart';
import '../../../../shared/widgets/app_bottom_nav.dart';
import '../../domain/entities/schedule_entities.dart';
import '../providers/schedule_controller.dart';

class SchedulePage extends ConsumerStatefulWidget {
  const SchedulePage({super.key});

  @override
  ConsumerState<SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends ConsumerState<SchedulePage> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(scheduleControllerProvider);
    final colors = ThemeColors.of(context);

    return Scaffold(
      backgroundColor: colors.backgroundSoft,
      appBar: AppBar(
        title: const Text('Schedule'),
        // The title and tabs are white, so the app bar must always sit on
        // navy — even when the flexible-space gradient has loose constraints.
        backgroundColor: AppColors.primary,
        foregroundColor: colors.onPrimary,
        // Same navy gradient treatment as the other screen headers.
        flexibleSpace: const SizedBox.expand(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomCenter,
                colors: [AppColors.primaryHover, AppColors.primary],
              ),
            ),
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          // Restrained gold accent for the active tab (spec: gold identifies
          // the selected day/highlight on navy).
          indicatorColor: AppColors.goldLight,
          indicatorWeight: 3,
          labelColor: colors.onPrimary,
          unselectedLabelColor: colors.onPrimary.withValues(alpha: 0.7),
          tabs: const [Tab(text: 'Today'), Tab(text: 'Week')],
        ),
      ),
      body: _buildBody(state, colors),
      bottomNavigationBar: const AppBottomNav(currentPath: '/schedule'),
    );
  }

  Widget _buildBody(ScheduleState state, ThemeColors colors) {
    return switch (state) {
      ScheduleLoading() => Center(child: CircularProgressIndicator(color: colors.textBold)),
      ScheduleFailed(:final message) => Center(
          child: ErrorState(
            message: message,
            onRetry: () => ref.read(scheduleControllerProvider.notifier).load(),
          ),
        ),
      ScheduleLoaded(:final schedule) => TabBarView(
          controller: _tabController,
          children: [
            _TodayTab(schedule: schedule, colors: colors, onRefresh: () => ref.read(scheduleControllerProvider.notifier).refresh()),
            _WeekTab(schedule: schedule, colors: colors, onRefresh: () => ref.read(scheduleControllerProvider.notifier).refresh()),
          ],
        ),
    };
  }
}

final _weekdayIndexToCode = ['SU', 'M', 'T', 'W', 'TH', 'F', 'S'];

class _TodayTab extends StatelessWidget {
  const _TodayTab({required this.schedule, required this.colors, required this.onRefresh});
  final WeeklySchedule schedule;
  final ThemeColors colors;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final todayCode = _weekdayIndexToCode[DateTime.now().weekday % 7];
    final todayClasses = schedule.classesFor(todayCode);

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: todayClasses.isEmpty
          ? ListView(
              children: [
                schedule.isEmpty
                    ? const EmptyState(
                        icon: Icons.event_busy,
                        title: 'Schedules not yet posted',
                        message: 'Your subjects are enrolled but class schedules haven\'t been assigned yet. Check back later or contact the Registrar.',
                      )
                    : const EmptyState(
                        icon: Icons.event_available_outlined,
                        title: 'No classes today',
                        message: 'Enjoy your day — switch to the Week tab to see your full schedule.',
                      ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.all(AppDimensions.md),
              children: [
                _AcademicContextBar(schedule: schedule, colors: colors),
                const SizedBox(height: AppDimensions.md),
                Text(schedule.dayLabel(todayCode), style: AppTextStyles.headlineSmall.copyWith(color: colors.textBold)),
                const SizedBox(height: AppDimensions.sm),
                for (final cls in todayClasses) ...[
                  _ScheduleClassCard(scheduleClass: cls, colors: colors, isToday: true),
                  const SizedBox(height: AppDimensions.sm),
                ],
              ],
            ),
    );
  }
}

class _WeekTab extends StatelessWidget {
  const _WeekTab({required this.schedule, required this.colors, required this.onRefresh});
  final WeeklySchedule schedule;
  final ThemeColors colors;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    if (schedule.isEmpty) {
      return ListView(
        children: const [
          EmptyState(
            icon: Icons.calendar_today_outlined,
            title: 'No schedule available',
            message: 'Your class schedule hasn\'t been set up yet. Check back once enrollment is finalized.',
          ),
        ],
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(AppDimensions.md),
        children: [
          _AcademicContextBar(schedule: schedule, colors: colors),
          const SizedBox(height: AppDimensions.lg),
          for (final dayCode in schedule.dayOrder) ...[
            if (schedule.classesFor(dayCode).isNotEmpty) ...[
              Text(schedule.dayLabel(dayCode), style: AppTextStyles.headlineSmall.copyWith(color: colors.textBold)),
              const SizedBox(height: AppDimensions.sm),
              for (final cls in schedule.classesFor(dayCode)) ...[
                _ScheduleClassCard(scheduleClass: cls, colors: colors),
                const SizedBox(height: AppDimensions.sm),
              ],
              const SizedBox(height: AppDimensions.md),
            ],
          ],
        ],
      ),
    );
  }
}

class _AcademicContextBar extends StatelessWidget {
  const _AcademicContextBar({required this.schedule, required this.colors});
  final WeeklySchedule schedule;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppDimensions.md, vertical: AppDimensions.sm),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          _item('School Year', schedule.schoolYear ?? '—'),
          _divider(),
          _item('Semester', schedule.semester ?? '—'),
          if (schedule.yearLevel != null) ...[
            _divider(),
            _item('Year', '${schedule.yearLevel}'),
          ],
        ],
      ),
    );
  }

  Widget _divider() => Container(width: 1, height: 24, color: colors.divider);

  Widget _item(String label, String value) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: AppTextStyles.headlineSmall.copyWith(fontWeight: FontWeight.w800, color: colors.textPrimary)),
          Text(label, style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted)),
        ],
      ),
    );
  }
}

class _ScheduleClassCard extends StatelessWidget {
  const _ScheduleClassCard({required this.scheduleClass, required this.colors, this.isToday = false});
  final ScheduleClass scheduleClass;
  final ThemeColors colors;
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: const EdgeInsets.all(AppDimensions.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(
          // Subtle gold edge marks today's classes; regular hairline
          // otherwise.
          color: isToday ? colors.gold.withValues(alpha: 0.35) : colors.border,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 72,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  scheduleClass.startTime,
                  style: AppTextStyles.headlineSmall.copyWith(
                    fontWeight: FontWeight.w800,
                    color: isToday ? colors.textBold : colors.textPrimary,
                  ),
                ),
                Text(
                  scheduleClass.endTime,
                  style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppDimensions.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  scheduleClass.subjectCode,
                  style: AppTextStyles.titleSmall.copyWith(fontWeight: FontWeight.w800, color: colors.textPrimary),
                ),
                const SizedBox(height: 2),
                Text(
                  scheduleClass.subjectTitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.bodySmall.copyWith(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.textSecondary,
                  ),
                ),
                const SizedBox(height: AppDimensions.xs),
                Row(
                  children: [
                    Icon(Icons.location_on_outlined, size: 16, color: colors.textMuted),
                    const SizedBox(width: 5),
                    Text(scheduleClass.room, style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted)),
                    const SizedBox(width: AppDimensions.sm),
                    Icon(Icons.person_outline, size: 16, color: colors.textMuted),
                    const SizedBox(width: 4),
                    Expanded(child: Text(scheduleClass.instructor, style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted), overflow: TextOverflow.ellipsis)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );

    // Gold left rail — the "upcoming / today" accent.
    if (!isToday) return card;
    return Stack(
      children: [
        card,
        Positioned(
          left: 0,
          top: 10,
          bottom: 10,
          child: Container(
            width: 3.5,
            decoration: BoxDecoration(
              color: colors.gold,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        ),
      ],
    );
  }
}
