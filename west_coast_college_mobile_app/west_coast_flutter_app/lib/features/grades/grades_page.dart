import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_provider.dart';
import '../../../shared/widgets/app_bottom_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';
import '../../../core/theme/app_text_styles.dart';

class GradesPage extends StatefulWidget {
  const GradesPage({super.key});

  @override
  State<GradesPage> createState() => _GradesPageState();
}

class _GradesPageState extends State<GradesPage> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final student = authProvider.student;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Grades'),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.onPrimary,
          labelColor: AppColors.onPrimary,
          unselectedLabelColor: AppColors.onPrimary.withOpacity(0.7),
          tabs: const [
            Tab(text: 'Current'),
            Tab(text: 'Previous'),
            Tab(text: 'Summary'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildCurrentGrades(student),
          _buildPreviousGrades(),
          _buildGradeSummary(student),
        ],
      ),
      bottomNavigationBar: const AppBottomNav(currentPath: '/grades'),
    );
  }

  Widget _buildCurrentGrades(student) {
    final currentGrades = _getSampleCurrentGrades();

    return ListView(
      padding: const EdgeInsets.all(AppDimensions.lg),
      children: [
        // Overall GPA Card
        _buildGPACard(
          title: 'Current Semester GPA',
          gpa: '1.75',
          color: AppColors.success,
        ),
        const SizedBox(height: AppDimensions.lg),
        
        // Course Grades
        const Text(
          'Current Semester Courses',
          style: AppTextStyles.headlineSmall,
        ),
        const SizedBox(height: AppDimensions.md),
        
        ...currentGrades.map((grade) => Padding(
          padding: const EdgeInsets.only(bottom: AppDimensions.md),
          child: _buildGradeCard(grade),
        )),
      ],
    );
  }

  Widget _buildPreviousGrades() {
    final previousSemesters = _getSamplePreviousSemesters();

    return ListView.builder(
      padding: const EdgeInsets.all(AppDimensions.lg),
      itemCount: previousSemesters.length,
      itemBuilder: (context, index) {
        final semester = previousSemesters[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: AppDimensions.lg),
          child: _buildSemesterCard(semester),
        );
      },
    );
  }

  Widget _buildGradeSummary(student) {
    return ListView(
      padding: const EdgeInsets.all(AppDimensions.lg),
      children: [
        // Overall GPA
        _buildGPACard(
          title: 'Overall GPA',
          gpa: '1.85',
          color: AppColors.primary,
        ),
        const SizedBox(height: AppDimensions.lg),
        
        // Statistics
        _buildStatisticsCard(),
        const SizedBox(height: AppDimensions.lg),
        
        // Grade Distribution
        _buildGradeDistribution(),
        const SizedBox(height: AppDimensions.lg),
        
        // Academic Standing
        _buildAcademicStanding(),
      ],
    );
  }

  Widget _buildGPACard({
    required String title,
    required String gpa,
    required Color color,
  }) {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppDimensions.cardPadding),
        child: Row(
          children: [
            Icon(
              Icons.school,
              color: color,
              size: 40,
            ),
            const SizedBox(width: AppDimensions.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Text(
                    gpa,
                    style: AppTextStyles.headlineLarge.copyWith(
                      color: color,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGradeCard(GradeItem grade) {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppDimensions.cardPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        grade.subject,
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: AppDimensions.xs),
                      Text(
                        grade.courseCode,
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                _buildGradeBadge(grade.grade),
              ],
            ),
            const SizedBox(height: AppDimensions.sm),
            const Divider(),
            const SizedBox(height: AppDimensions.sm),
            Row(
              children: [
                Expanded(
                  child: _buildInfoItem('Units', grade.units.toString()),
                ),
                Expanded(
                  child: _buildInfoItem('Credits', grade.credits.toString()),
                ),
                Expanded(
                  child: _buildInfoItem('Status', grade.status),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGradeBadge(String grade) {
    Color color;
    
    if (double.tryParse(grade) != null) {
      final gpa = double.parse(grade);
      if (gpa <= 1.5) {
        color = AppColors.success;
      } else if (gpa <= 2.0) {
        color = AppColors.info;
      } else if (gpa <= 2.5) {
        color = AppColors.warning;
      } else {
        color = AppColors.error;
      }
    } else {
      color = AppColors.textMuted;
    }

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppDimensions.md,
        vertical: AppDimensions.sm,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: color),
      ),
      child: Text(
        grade,
        style: AppTextStyles.titleLarge.copyWith(
          color: color,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _buildInfoItem(String label, String value) {
    return Column(
      children: [
        Text(
          label,
          style: AppTextStyles.bodySmall.copyWith(
            color: AppColors.textMuted,
          ),
        ),
        const SizedBox(height: AppDimensions.xs),
        Text(
          value,
          style: AppTextStyles.bodyMedium.copyWith(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildSemesterCard(SemesterGrades semester) {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: ExpansionTile(
        title: Text(
          semester.name,
          style: AppTextStyles.bodyMedium.copyWith(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w500,
          ),
        ),
        subtitle: Text(
          'GPA: ${semester.gpa}',
          style: AppTextStyles.bodySmall.copyWith(
            color: AppColors.textMuted,
          ),
        ),
        children: [
          Padding(
            padding: const EdgeInsets.all(AppDimensions.md),
            child: Column(
              children: semester.grades.map((grade) => Padding(
                padding: const EdgeInsets.only(bottom: AppDimensions.sm),
                child: _buildCompactGradeRow(grade),
              )).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCompactGradeRow(GradeItem grade) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          flex: 3,
          child: Text(
            grade.subject,
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.textPrimary,
            ),
          ),
        ),
        Expanded(
          flex: 2,
          child: Text(
            grade.courseCode,
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.textMuted,
            ),
          ),
        ),
        Expanded(
          child: Text(
            grade.grade,
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w500,
            ),
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }

  Widget _buildStatisticsCard() {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppDimensions.cardPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Statistics',
              style: AppTextStyles.headlineSmall,
            ),
            const SizedBox(height: AppDimensions.md),
            _buildStatRow('Total Units Completed', '45'),
            _buildStatRow('Total Credits Earned', '135'),
            _buildStatRow('Courses Passed', '15'),
            _buildStatRow('Courses Failed', '0'),
          ],
        ),
      ),
    );
  }

  Widget _buildStatRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppDimensions.sm),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: AppTextStyles.bodyMedium.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          Text(
            value,
            style: AppTextStyles.bodyMedium.copyWith(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGradeDistribution() {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppDimensions.cardPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Grade Distribution',
              style: AppTextStyles.headlineSmall,
            ),
            const SizedBox(height: AppDimensions.md),
            _buildGradeBar('1.0 - 1.5', 8, AppColors.success),
            _buildGradeBar('1.6 - 2.0', 12, AppColors.info),
            _buildGradeBar('2.1 - 2.5', 5, AppColors.warning),
            _buildGradeBar('2.6 - 3.0', 2, AppColors.error),
            _buildGradeBar('3.1 - 5.0', 0, AppColors.textMuted),
          ],
        ),
      ),
    );
  }

  Widget _buildGradeBar(String range, int count, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppDimensions.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                range,
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              Text(
                '$count subjects',
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppDimensions.xs),
          LinearProgressIndicator(
            value: count / 15.0, // Normalize to max 15
            backgroundColor: AppColors.border,
            color: color,
            minHeight: 8,
          ),
        ],
      ),
    );
  }

  Widget _buildAcademicStanding() {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppDimensions.cardPadding),
        child: Row(
          children: [
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: AppColors.success.withOpacity(0.1),
                borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
              ),
              child: Icon(
                Icons.verified,
                color: AppColors.success,
                size: 30,
              ),
            ),
            const SizedBox(width: AppDimensions.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Good Academic Standing',
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Text(
                    'No academic warnings or probations',
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<GradeItem> _getSampleCurrentGrades() {
    return [
      GradeItem(
        subject: 'College Algebra',
        courseCode: 'MATH 101',
        grade: '1.5',
        units: 3,
        credits: 3,
        status: 'Passed',
      ),
      GradeItem(
        subject: 'English Communication',
        courseCode: 'ENG 101',
        grade: '1.75',
        units: 3,
        credits: 3,
        status: 'Passed',
      ),
      GradeItem(
        subject: 'Introduction to Computer Science',
        courseCode: 'CS 101',
        grade: '1.25',
        units: 3,
        credits: 3,
        status: 'Passed',
      ),
      GradeItem(
        subject: 'Physics Fundamentals',
        courseCode: 'PHYS 101',
        grade: '2.0',
        units: 3,
        credits: 3,
        status: 'Passed',
      ),
      GradeItem(
        subject: 'Calculus I',
        courseCode: 'MATH 201',
        grade: '1.75',
        units: 3,
        credits: 3,
        status: 'Passed',
      ),
    ];
  }

  List<SemesterGrades> _getSamplePreviousSemesters() {
    return [
      SemesterGrades(
        name: 'First Semester 2024-2025',
        gpa: '1.85',
        grades: [
          GradeItem(
            subject: 'Trigonometry',
            courseCode: 'MATH 102',
            grade: '1.75',
            units: 3,
            credits: 3,
            status: 'Passed',
          ),
          GradeItem(
            subject: 'Physics II',
            courseCode: 'PHYS 102',
            grade: '2.0',
            units: 3,
            credits: 3,
            status: 'Passed',
          ),
        ],
      ),
      SemesterGrades(
        name: 'Second Semester 2023-2024',
        gpa: '1.90',
        grades: [
          GradeItem(
            subject: 'Advanced Mathematics',
            courseCode: 'MATH 103',
            grade: '2.0',
            units: 3,
            credits: 3,
            status: 'Passed',
          ),
        ],
      ),
    ];
  }
}

class GradeItem {
  final String subject;
  final String courseCode;
  final String grade;
  final int units;
  final int credits;
  final String status;

  GradeItem({
    required this.subject,
    required this.courseCode,
    required this.grade,
    required this.units,
    required this.credits,
    required this.status,
  });
}

class SemesterGrades {
  final String name;
  final String gpa;
  final List<GradeItem> grades;

  SemesterGrades({
    required this.name,
    required this.gpa,
    required this.grades,
  });
}