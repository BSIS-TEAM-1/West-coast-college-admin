import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/animations/entrance.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
import '../../../../core/widgets/depth.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/error_state.dart';
import '../../../../core/widgets/section_header.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../../../shared/widgets/app_bottom_nav.dart';
import '../../domain/entities/grade_entities.dart';
import '../providers/grades_controller.dart';

class GradesPage extends ConsumerStatefulWidget {
  const GradesPage({super.key});

  @override
  ConsumerState<GradesPage> createState() => _GradesPageState();
}

class _GradesPageState extends ConsumerState<GradesPage> with SingleTickerProviderStateMixin {
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
    final state = ref.watch(gradesControllerProvider);
    final colors = ThemeColors.of(context);

    return Scaffold(
      backgroundColor: colors.backgroundSoft,
      appBar: AppBar(
        title: const Text('Grades'),
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
              icon: Icons.school_rounded,
              tone: DepthTone.gold,
              size: 36,
              radius: 11,
            ),
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          // Restrained gold accent for the active tab, matching Schedule.
          indicatorColor: AppColors.goldLight,
          indicatorWeight: 3,
          labelColor: colors.onPrimary,
          unselectedLabelColor: colors.onPrimary.withValues(alpha: 0.7),
          tabs: const [Tab(text: 'Current'), Tab(text: 'History')],
        ),
      ),
      body: _buildBody(state, colors),
      bottomNavigationBar: const AppBottomNav(currentPath: '/grades'),
    );
  }

  Widget _buildBody(GradesState state, ThemeColors colors) {
    return switch (state) {
      GradesLoading() => Center(child: CircularProgressIndicator(color: colors.textBold)),
      GradesFailed(:final message) => Center(
          child: ErrorState(
            message: message,
            onRetry: () => ref.read(gradesControllerProvider.notifier).load(),
          ),
        ),
      GradesLoaded(:final data) => TabBarView(
          controller: _tabController,
          children: [
            _CurrentTab(data: data, colors: colors, onRefresh: () => ref.read(gradesControllerProvider.notifier).refresh()),
            _HistoryTab(data: data, colors: colors, onRefresh: () => ref.read(gradesControllerProvider.notifier).refresh()),
          ],
        ),
    };
  }
}

class _CurrentTab extends StatelessWidget {
  const _CurrentTab({required this.data, required this.colors, required this.onRefresh});
  final GradesData data;
  final ThemeColors colors;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final currentPeriods = data.periods.where((p) => p.isCurrent).toList();

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: currentPeriods.isEmpty
          ? ListView(
              children: const [
                EmptyState(
                  icon: Icons.grade_outlined,
                  title: 'No grades for this term',
                  message: "Your grades haven't been posted yet. Check back once your professors submit them.",
                ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.all(AppDimensions.md),
              children: [
                if (currentPeriods.first.termGpa != null)
                  Entrance(
                    child: _GpaCard(
                      label: 'Current Term GPA',
                      gpa: currentPeriods.first.termGpa!,
                      colors: colors,
                    ),
                  ),
                if (currentPeriods.first.termGpa != null) const SizedBox(height: AppDimensions.lg),
                Entrance(
                  order: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SectionHeader(title: currentPeriods.first.label),
                      const SizedBox(height: AppDimensions.sm),
                      _PeriodSection(period: currentPeriods.first, colors: colors),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class _HistoryTab extends StatelessWidget {
  const _HistoryTab({required this.data, required this.colors, required this.onRefresh});
  final GradesData data;
  final ThemeColors colors;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final historicalPeriods = data.periods.where((p) => !p.isCurrent).toList();

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: historicalPeriods.isEmpty
          ? ListView(
              children: [
                if (data.summary.cumulativeGpa != null) ...[
                  const SizedBox(height: AppDimensions.lg),
                  _GpaCard(label: 'Cumulative GPA', gpa: data.summary.cumulativeGpa!, colors: colors),
                ],
                const EmptyState(
                  icon: Icons.history_edu_outlined,
                  title: 'No historical grades',
                  message: 'Once you complete a semester, your grades will appear here.',
                ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.all(AppDimensions.md),
              children: [
                if (data.summary.cumulativeGpa != null) ...[
                  _GpaCard(label: 'Cumulative GPA', gpa: data.summary.cumulativeGpa!, colors: colors),
                  const SizedBox(height: AppDimensions.lg),
                ],
                for (final (i, period) in historicalPeriods.indexed) Entrance(
                  order: i + 1,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SectionHeader(title: period.label),
                      const SizedBox(height: AppDimensions.sm),
                      _PeriodSection(period: period, colors: colors),
                      const SizedBox(height: AppDimensions.lg),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class _GpaCard extends StatelessWidget {
  const _GpaCard({required this.label, required this.gpa, required this.colors});
  final String label;
  final num gpa;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppDimensions.cardPadding),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primaryHover, AppColors.primary],
        ),
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: Colors.white.withValues(alpha: .08)),
        boxShadow: [
          BoxShadow(
            color: AppColors.shadow.withValues(alpha: .25),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
          BoxShadow(
            color: Colors.white.withValues(alpha: .05),
            blurRadius: 2,
            offset: const Offset(0, -1),
          ),
        ],
      ),
      child: Row(
        children: [
          DepthIconTile(
            icon: Icons.workspace_premium_rounded,
            tone: DepthTone.gold,
            size: 46,
          ),
          const SizedBox(width: AppDimensions.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: AppTextStyles.bodySmall.copyWith(color: AppColors.goldLight)),
                Text(
                  gpa.toStringAsFixed(2),
                  style: AppTextStyles.headlineLarge.copyWith(color: Colors.white),
                ),
              ],
            ),
          ),
          Text('$gpa GPA', style: AppTextStyles.caption.copyWith(color: Colors.white.withValues(alpha: .7))),
        ],
      ),
    );
  }
}

class _PeriodSection extends StatelessWidget {
  const _PeriodSection({required this.period, required this.colors});
  final GradePeriod period;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < period.subjects.length; i++) ...[
            if (i > 0) Divider(height: 1, color: colors.divider),
            _GradeRow(entry: period.subjects[i], colors: colors),
          ],
        ],
      ),
    );
  }
}

class _GradeRow extends StatelessWidget {
  const _GradeRow({required this.entry, required this.colors});
  final GradeEntry entry;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppDimensions.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(entry.subjectCode, style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(entry.subjectTitle, style: AppTextStyles.bodySmall.copyWith(color: colors.textSecondary)),
                  ],
                ),
              ),
              const SizedBox(width: AppDimensions.sm),
              if (entry.hasNoGrade)
                const StatusBadge(label: 'NO GRADE', tone: StatusTone.neutral)
              else if (entry.hasGradeMark)
                StatusBadge(label: entry.gradeMark!, tone: StatusTone.info)
              else if (entry.isInProgress)
                const StatusBadge(label: 'IN PROGRESS', tone: StatusTone.info)
              else if (entry.isPassed)
                StatusBadge(label: entry.remarks.isEmpty ? 'PASSED' : entry.remarks, tone: StatusTone.success)
              else
                StatusBadge(label: entry.remarks.isEmpty ? 'FAILED' : entry.remarks, tone: StatusTone.danger),
            ],
          ),
          const SizedBox(height: AppDimensions.sm),
          Divider(height: 1, color: colors.divider),
          const SizedBox(height: AppDimensions.sm),
          Row(
            children: [
              _meta('Grade', entry.displayGrade),
              _meta('Units', entry.units.toString()),
              _meta('Status', entry.status.isEmpty ? '—' : entry.status),
            ],
          ),
        ],
      ),
    );
  }

  Widget _meta(String label, String value) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppTextStyles.caption.copyWith(color: colors.textMuted)),
          const SizedBox(height: 2),
          Text(value, style: AppTextStyles.bodyMedium.copyWith(color: colors.textPrimary)),
        ],
      ),
    );
  }
}
