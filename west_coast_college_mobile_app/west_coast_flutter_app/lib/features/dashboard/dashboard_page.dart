import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_provider.dart';
import '../../../shared/widgets/app_bottom_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';
import '../../../core/theme/app_text_styles.dart';

class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final student = authProvider.student;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Welcome, ${student?.firstName ?? 'Student'}',
          style: AppTextStyles.headlineMedium.copyWith(
            color: AppColors.onPrimary,
          ),
        ),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppDimensions.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Status Card
            _buildStatusCard(student),
            const SizedBox(height: AppDimensions.lg),
            
            // Today's Schedule Preview
            _buildSchedulePreview(),
            const SizedBox(height: AppDimensions.lg),
            
            // Recent Announcements
            _buildAnnouncementsPreview(),
            const SizedBox(height: AppDimensions.lg),
            
            // Quick Actions
            _buildQuickActions(),
            const SizedBox(height: AppDimensions.xl),
          ],
        ),
      ),
      bottomNavigationBar: const AppBottomNav(currentPath: '/dashboard'),
    );
  }

  Widget _buildStatusCard(student) {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppDimensions.cardPadding),
        child: Row(
          children: [
            // Avatar
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: AppColors.primarySubtle,
                borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
              ),
              child: const Icon(
                Icons.person,
                size: 32,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: AppDimensions.md),
            
            // Student Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    student?.fullName ?? 'Student Name',
                    style: AppTextStyles.titleLarge.copyWith(
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Text(
                    student?.studentNumber ?? 'Student UID',
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Row(
                    children: [
                      _buildStatusBadge(student?.lifecycleStatus),
                      const SizedBox(width: AppDimensions.sm),
                      Text(
                        '${student?.courseName ?? 'Course'} • Year ${student?.yearLevel ?? 1}',
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.textSecondary,
                        ),
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

  Widget _buildStatusBadge(String? status) {
    Color badgeColor;
    String badgeText;

    switch (status) {
      case 'Enrolled':
        badgeColor = AppColors.success;
        badgeText = 'Enrolled';
        break;
      case 'Pending':
        badgeColor = AppColors.warning;
        badgeText = 'Pending';
        break;
      case 'Not Enrolled':
        badgeColor = AppColors.error;
        badgeText = 'Not Enrolled';
        break;
      default:
        badgeColor = AppColors.textMuted;
        badgeText = status ?? 'Unknown';
    }

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppDimensions.sm,
        vertical: AppDimensions.xs,
      ),
      decoration: BoxDecoration(
        color: badgeColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppDimensions.radiusSmall),
      ),
      child: Text(
        badgeText,
        style: AppTextStyles.labelSmall.copyWith(
          color: badgeColor,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildSchedulePreview() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              "Today's Schedule",
              style: AppTextStyles.headlineSmall,
            ),
            TextButton(
              onPressed: () {},
              child: Text(
                'View All',
                style: AppTextStyles.link,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppDimensions.md),
        Card(
          elevation: AppDimensions.cardElevation,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppDimensions.cardPadding),
            child: Column(
              children: [
                _buildScheduleItem(
                  time: '08:00 AM',
                  subject: 'College Algebra',
                  room: 'Room 101',
                  professor: 'Prof. Smith',
                ),
                const Divider(),
                _buildScheduleItem(
                  time: '10:00 AM',
                  subject: 'English Communication',
                  room: 'Room 102',
                  professor: 'Prof. Johnson',
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildScheduleItem({
    required String time,
    required String subject,
    required String room,
    required String professor,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppDimensions.sm),
      child: Row(
        children: [
          Container(
            width: 80,
            child: Text(
              time,
              style: AppTextStyles.bodyMedium.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  subject,
                  style: AppTextStyles.bodyMedium.copyWith(
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: AppDimensions.xs),
                Text(
                  '$room • $professor',
                  style: AppTextStyles.bodySmall.copyWith(
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAnnouncementsPreview() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Recent Announcements',
              style: AppTextStyles.headlineSmall,
            ),
            TextButton(
              onPressed: () {},
              child: Text(
                'View All',
                style: AppTextStyles.link,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppDimensions.md),
        Card(
          elevation: AppDimensions.cardElevation,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
          ),
          child: ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: 2,
            separatorBuilder: (context, index) => const Divider(),
            itemBuilder: (context, index) {
              return _buildAnnouncementItem(
                title: index == 0
                    ? 'Midterm Examination Schedule'
                    : 'Holiday Announcement',
                message: index == 0
                    ? 'Midterm exams will start on October 15, 2025'
                    : 'College closed on August 30 for National Heroes Day',
                isUrgent: index == 1,
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildAnnouncementItem({
    required String title,
    required String message,
    required bool isUrgent,
  }) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppDimensions.md,
        vertical: AppDimensions.sm,
      ),
      leading: Icon(
        isUrgent ? Icons.announcement : Icons.info,
        color: isUrgent ? AppColors.warning : AppColors.info,
        size: AppDimensions.iconMedium,
      ),
      title: Text(
        title,
        style: AppTextStyles.bodyMedium.copyWith(
          color: AppColors.textPrimary,
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: Text(
        message,
        style: AppTextStyles.bodySmall.copyWith(
          color: AppColors.textMuted,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Quick Actions',
          style: AppTextStyles.headlineSmall,
        ),
        const SizedBox(height: AppDimensions.md),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 4,
          mainAxisSpacing: AppDimensions.md,
          crossAxisSpacing: AppDimensions.md,
          children: [
            _buildQuickAction(
              icon: Icons.school,
              label: 'Grades',
              onTap: () {},
            ),
            _buildQuickAction(
              icon: Icons.calendar_today,
              label: 'Schedule',
              onTap: () {},
            ),
            _buildQuickAction(
              icon: Icons.description,
              label: 'Documents',
              onTap: () {},
            ),
            _buildQuickAction(
              icon: Icons.support_agent,
              label: 'Support',
              onTap: () {},
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildQuickAction({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              color: AppColors.primary,
              size: AppDimensions.iconLarge,
            ),
            const SizedBox(height: AppDimensions.sm),
            Text(
              label,
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.textPrimary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}