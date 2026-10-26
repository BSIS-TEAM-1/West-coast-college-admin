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
import '../providers/grades_providers.dart';

const List<String> _kEvaluationQuestions = [
  'The professor explains lessons clearly.',
  'The professor demonstrates knowledge of the subject.',
  'The professor comes to class prepared and on time.',
  'The professor treats students fairly and respectfully.',
  'The professor communicates effectively.',
  'The professor encourages student participation.',
  'The professor manages class time effectively.',
  'The professor provides helpful feedback.',
  'The professor uses effective teaching methods.',
  'Overall, the professor demonstrates teaching effectiveness.',
];

class _EmojiScaleItem {
  final int value;
  final String emoji;
  final String label;
  const _EmojiScaleItem(this.value, this.emoji, this.label);
}

const List<_EmojiScaleItem> _kEmojiScale = [
  _EmojiScaleItem(1, '😡', 'Very Poor'),
  _EmojiScaleItem(2, '😕', 'Poor'),
  _EmojiScaleItem(3, '😐', 'Average'),
  _EmojiScaleItem(4, '😊', 'Good'),
  _EmojiScaleItem(5, '🤩', 'Excellent'),
];

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

  Future<void> _openEvaluationSheet(GradePeriod period, GradeEntry entry) async {
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _ProfessorEvaluationSheet(
        period: period,
        entry: entry,
      ),
    );
    if (submitted == true && mounted) {
      await ref.read(gradesControllerProvider.notifier).refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(gradesControllerProvider);
    final colors = ThemeColors.of(context);

    return Scaffold(
      backgroundColor: colors.backgroundSoft,
      appBar: AppBar(
        title: const Text('Grades & Evaluation'),
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
            _CurrentTab(
              data: data,
              colors: colors,
              onRefresh: () => ref.read(gradesControllerProvider.notifier).refresh(),
              onEvaluate: _openEvaluationSheet,
            ),
            _HistoryTab(
              data: data,
              colors: colors,
              onRefresh: () => ref.read(gradesControllerProvider.notifier).refresh(),
              onEvaluate: _openEvaluationSheet,
            ),
          ],
        ),
    };
  }
}

class _CurrentTab extends StatelessWidget {
  const _CurrentTab({
    required this.data,
    required this.colors,
    required this.onRefresh,
    required this.onEvaluate,
  });
  final GradesData data;
  final ThemeColors colors;
  final Future<void> Function() onRefresh;
  final void Function(GradePeriod period, GradeEntry entry) onEvaluate;

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
                if (currentPeriods.first.termGpa != null && !currentPeriods.first.gradesLocked)
                  Entrance(
                    child: _GpaCard(
                      label: 'Current Term GPA',
                      gpa: currentPeriods.first.termGpa!,
                      colors: colors,
                    ),
                  ),
                if (currentPeriods.first.termGpa != null && !currentPeriods.first.gradesLocked)
                  const SizedBox(height: AppDimensions.md),
                Entrance(
                  order: 1,
                  child: _EvaluationStatusBanner(
                    period: currentPeriods.first,
                    colors: colors,
                  ),
                ),
                const SizedBox(height: AppDimensions.md),
                Entrance(
                  order: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SectionHeader(title: currentPeriods.first.label),
                      const SizedBox(height: AppDimensions.sm),
                      _PeriodSection(
                        period: currentPeriods.first,
                        colors: colors,
                        onEvaluate: onEvaluate,
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class _HistoryTab extends StatelessWidget {
  const _HistoryTab({
    required this.data,
    required this.colors,
    required this.onRefresh,
    required this.onEvaluate,
  });
  final GradesData data;
  final ThemeColors colors;
  final Future<void> Function() onRefresh;
  final void Function(GradePeriod period, GradeEntry entry) onEvaluate;

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
                for (final (i, period) in historicalPeriods.indexed)
                  Entrance(
                    order: i + 1,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SectionHeader(title: period.label),
                        const SizedBox(height: AppDimensions.sm),
                        if (period.gradesLocked) ...[
                          _EvaluationStatusBanner(period: period, colors: colors),
                          const SizedBox(height: AppDimensions.sm),
                        ],
                        _PeriodSection(period: period, colors: colors, onEvaluate: onEvaluate),
                        const SizedBox(height: AppDimensions.lg),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}

class _EvaluationStatusBanner extends StatelessWidget {
  const _EvaluationStatusBanner({required this.period, required this.colors});
  final GradePeriod period;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    final total = period.evaluationRequiredCount > 0 ? period.evaluationRequiredCount : period.subjects.length;
    final completed = period.evaluationCompletedCount;
    final allDone = total > 0 && completed >= total;
    final progress = total > 0 ? (completed / total).clamp(0.0, 1.0) : 1.0;

    return Container(
      padding: const EdgeInsets.all(AppDimensions.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(
          color: allDone ? Colors.green.withValues(alpha: 0.4) : Colors.amber.withValues(alpha: 0.5),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                allDone ? Icons.lock_open_rounded : Icons.lock_rounded,
                size: 20,
                color: allDone ? Colors.green.shade600 : Colors.amber.shade700,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  allDone
                      ? 'All Professor Evaluations Completed ($completed/$total)'
                      : 'Complete the required professor evaluations to access your grades.',
                  style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 7,
              backgroundColor: colors.divider,
              valueColor: AlwaysStoppedAnimation<Color>(
                allDone ? Colors.green.shade600 : AppColors.primary,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.schedule_rounded, size: 14, color: colors.textMuted),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  period.evaluationDeadlineDate != null && period.evaluationDeadlineDate!.isNotEmpty
                      ? 'Registrar Deadline: ${period.evaluationDeadlineDate} ${period.evaluationClosingTime ?? ''}'
                      : 'Anonymous evaluation required before viewing released grades.',
                  style: AppTextStyles.caption.copyWith(color: colors.textSecondary),
                ),
              ),
            ],
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
  const _PeriodSection({
    required this.period,
    required this.colors,
    required this.onEvaluate,
  });
  final GradePeriod period;
  final ThemeColors colors;
  final void Function(GradePeriod period, GradeEntry entry) onEvaluate;

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
            _GradeRow(
              period: period,
              entry: period.subjects[i],
              colors: colors,
              onEvaluate: () => onEvaluate(period, period.subjects[i]),
            ),
          ],
        ],
      ),
    );
  }
}

class _GradeRow extends StatelessWidget {
  const _GradeRow({
    required this.period,
    required this.entry,
    required this.colors,
    required this.onEvaluate,
  });
  final GradePeriod period;
  final GradeEntry entry;
  final ThemeColors colors;
  final VoidCallback onEvaluate;

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
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.person_outline_rounded, size: 14, color: colors.textMuted),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            entry.professorName,
                            style: AppTextStyles.caption.copyWith(color: colors.textSecondary),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppDimensions.sm),
              if (entry.gradeLocked)
                const StatusBadge(label: 'LOCKED', tone: StatusTone.warning)
              else if (entry.hasNoGrade)
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
          const SizedBox(height: AppDimensions.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              if (entry.evaluationCompleted)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.check_circle_rounded, size: 16, color: Colors.green.shade700),
                      const SizedBox(width: 6),
                      Text(
                        'Professor Evaluated',
                        style: AppTextStyles.caption.copyWith(
                          color: Colors.green.shade700,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                )
              else
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: period.evaluationIsOpen ? onEvaluate : null,
                    icon: const Icon(Icons.rate_review_rounded, size: 16),
                    label: Text(
                      period.evaluationIsOpen ? 'Evaluate Professor' : 'Evaluation Closed',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
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

class _ProfessorEvaluationSheet extends ConsumerStatefulWidget {
  const _ProfessorEvaluationSheet({
    required this.period,
    required this.entry,
  });
  final GradePeriod period;
  final GradeEntry entry;

  @override
  ConsumerState<_ProfessorEvaluationSheet> createState() => _ProfessorEvaluationSheetState();
}

class _ProfessorEvaluationSheetState extends ConsumerState<_ProfessorEvaluationSheet> {
  final Map<int, int> _ratings = {};
  final TextEditingController _commentController = TextEditingController();
  int? _bouncingQuestion;
  bool _submitting = false;
  String? _errorMessage;
  bool _submitted = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  void _selectRating(int questionNumber, int ratingValue) {
    setState(() {
      _ratings[questionNumber] = ratingValue;
      _bouncingQuestion = questionNumber;
      _errorMessage = null;
    });
    Future.delayed(const Duration(milliseconds: 420), () {
      if (mounted && _bouncingQuestion == questionNumber) {
        setState(() => _bouncingQuestion = null);
      }
    });
  }

  Future<void> _submit() async {
    if (_ratings.length < _kEvaluationQuestions.length) {
      setState(() {
        _errorMessage = 'Please rate all 10 questions (${_ratings.length}/10 completed).';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      final ratingsPayload = [
        for (var i = 1; i <= _kEvaluationQuestions.length; i++)
          {'questionNumber': i, 'rating': _ratings[i]!},
      ];

      await ref.read(gradesRemoteDataSourceProvider).submitProfessorEvaluation(
            schoolYear: widget.period.schoolYear,
            semester: widget.period.semester,
            subjectId: widget.entry.subjectId,
            subjectCode: widget.entry.subjectCode,
            ratings: ratingsPayload,
            comment: _commentController.text.trim(),
          );

      if (mounted) {
        setState(() {
          _submitting = false;
          _submitted = true;
        });
      }
    } catch (err) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _errorMessage = err.toString().replaceAll('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    final disableAnimations = MediaQuery.disableAnimationsOf(context);
    final answeredCount = _ratings.length;
    final progress = answeredCount / _kEvaluationQuestions.length;

    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.6,
      maxChildSize: 0.95,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: _submitted
              ? Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      TweenAnimationBuilder<double>(
                        tween: Tween(begin: disableAnimations ? 1.0 : 0.4, end: 1.0),
                        duration: const Duration(milliseconds: 450),
                        curve: Curves.elasticOut,
                        builder: (context, scale, child) => Transform.scale(scale: scale, child: child),
                        child: Container(
                          width: 78,
                          height: 78,
                          decoration: BoxDecoration(
                            color: Colors.green.withValues(alpha: 0.15),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(Icons.check_circle_rounded, size: 54, color: Colors.green.shade600),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Evaluation Submitted!',
                        style: AppTextStyles.headlineMedium.copyWith(fontWeight: FontWeight.w800),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Thank you for evaluating ${widget.entry.professorName} (${widget.entry.subjectCode}). Your responses were recorded anonymously.',
                        style: AppTextStyles.bodySmall.copyWith(color: colors.textSecondary),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () => Navigator.of(context).pop(true),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text('Return to Grades', style: TextStyle(fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ],
                  ),
                )
              : Column(
                  children: [
                    // Header
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 14, 12, 10),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${widget.entry.subjectCode} • ${widget.entry.professorName}',
                                  style: AppTextStyles.caption.copyWith(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  widget.entry.subjectTitle,
                                  style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w800),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            onPressed: _submitting ? null : () => Navigator.of(context).pop(false),
                            icon: const Icon(Icons.close_rounded),
                          ),
                        ],
                      ),
                    ),
                    // Animated Progress Bar
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '$answeredCount of ${_kEvaluationQuestions.length} questions completed',
                                style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w700),
                              ),
                              Text(
                                '${(progress * 100).round()}%',
                                style: AppTextStyles.caption.copyWith(
                                  color: AppColors.primary,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(999),
                            child: LinearProgressIndicator(
                              value: progress,
                              minHeight: 7,
                              backgroundColor: colors.divider,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                answeredCount == _kEvaluationQuestions.length
                                    ? Colors.green.shade600
                                    : AppColors.primary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (_errorMessage != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.red.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            _errorMessage!,
                            style: AppTextStyles.caption.copyWith(color: Colors.red.shade700),
                          ),
                        ),
                      ),
                    // Questions List
                    Expanded(
                      child: ListView.builder(
                        controller: scrollController,
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                        itemCount: _kEvaluationQuestions.length + 2,
                        itemBuilder: (context, index) {
                          if (index == _kEvaluationQuestions.length) {
                            return Padding(
                              padding: const EdgeInsets.only(top: 8, bottom: 12),
                              child: TextField(
                                controller: _commentController,
                                maxLines: 3,
                                maxLength: 1500,
                                decoration: InputDecoration(
                                  labelText: 'Comments & Suggestions (Optional)',
                                  hintText: 'Share constructive feedback...',
                                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                              ),
                            );
                          }
                          if (index == _kEvaluationQuestions.length + 1) {
                            return Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.green.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Row(
                                children: [
                                  Icon(Icons.verified_user_outlined, size: 18, color: Colors.green.shade700),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      'Anonymity Protected: Your name and student number are hidden from professors. Authorized Registrar access is audited.',
                                      style: AppTextStyles.caption.copyWith(color: colors.textSecondary),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          }

                          final qNum = index + 1;
                          final qText = _kEvaluationQuestions[index];
                          final selectedRating = _ratings[qNum];

                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: colors.backgroundSoft,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: selectedRating != null
                                    ? AppColors.primary.withValues(alpha: 0.45)
                                    : colors.border,
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '$qNum. $qText',
                                  style: AppTextStyles.bodySmall.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: colors.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    for (final item in _kEmojiScale)
                                      Expanded(
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 2),
                                          child: _AnimatedEmojiButton(
                                            item: item,
                                            isSelected: selectedRating == item.value,
                                            isBouncing: !disableAnimations &&
                                                selectedRating == item.value &&
                                                _bouncingQuestion == qNum,
                                            onTap: () => _selectRating(qNum, item.value),
                                            colors: colors,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                    // Submit Button
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                        child: SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _submitting ? null : _submit,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: answeredCount == _kEvaluationQuestions.length
                                  ? Colors.green.shade600
                                  : AppColors.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: Text(
                              _submitting
                                  ? 'Submitting...'
                                  : 'Submit Evaluation ($answeredCount/${_kEvaluationQuestions.length})',
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
        );
      },
    );
  }
}

class _AnimatedEmojiButton extends StatelessWidget {
  const _AnimatedEmojiButton({
    required this.item,
    required this.isSelected,
    required this.isBouncing,
    required this.onTap,
    required this.colors,
  });
  final _EmojiScaleItem item;
  final bool isSelected;
  final bool isBouncing;
  final VoidCallback onTap;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary.withValues(alpha: 0.12) : colors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? AppColors.primary : colors.border,
            width: isSelected ? 1.6 : 1.0,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedScale(
              scale: isBouncing ? 1.12 : (isSelected ? 1.06 : 1.0),
              duration: const Duration(milliseconds: 160),
              curve: Curves.easeOutCubic,
              child: Text(item.emoji, style: const TextStyle(fontSize: 22)),
            ),
            const SizedBox(height: 2),
            Text(
              '${item.value}',
              style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w800),
            ),
            Text(
              item.label,
              style: AppTextStyles.caption.copyWith(fontSize: 9, color: colors.textSecondary),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
