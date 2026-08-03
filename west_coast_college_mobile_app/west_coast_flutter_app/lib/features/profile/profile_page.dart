import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_provider.dart';
import '../../../shared/widgets/app_bottom_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';
import '../../../core/theme/app_text_styles.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final student = authProvider.student;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppDimensions.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Profile Header
            _buildProfileHeader(student),
            const SizedBox(height: AppDimensions.lg),
            
            // Personal Information
            _buildSection(
              title: 'Personal Information',
              child: _buildPersonalInfo(student),
            ),
            const SizedBox(height: AppDimensions.lg),
            
            // Contact Information
            _buildSection(
              title: 'Contact Information',
              child: _buildContactInfo(student),
            ),
            const SizedBox(height: AppDimensions.lg),
            
            // Academic Summary
            _buildSection(
              title: 'Academic Summary',
              child: _buildAcademicSummary(student),
            ),
            const SizedBox(height: AppDimensions.lg),
            
            // Emergency Contact
            _buildSection(
              title: 'Emergency Contact',
              child: _buildEmergencyContact(student),
            ),
            const SizedBox(height: AppDimensions.lg),
            
            // Settings Button
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => context.go('/settings'),
                icon: const Icon(Icons.settings),
                label: const Text('Settings'),
              ),
            ),
            const SizedBox(height: AppDimensions.xl),
          ],
        ),
      ),
      bottomNavigationBar: const AppBottomNav(currentPath: '/profile'),
    );
  }

  Widget _buildProfileHeader(student) {
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
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppColors.primarySubtle,
                borderRadius: BorderRadius.circular(AppDimensions.radiusRound),
              ),
              child: const Icon(
                Icons.person,
                size: 40,
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
                    style: AppTextStyles.headlineSmall.copyWith(
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Text(
                    student?.studentNumber ?? 'Student UID',
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  _buildStatusBadge(student?.lifecycleStatus),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection({
    required String title,
    required Widget child,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTextStyles.headlineSmall,
        ),
        const SizedBox(height: AppDimensions.md),
        Card(
          elevation: AppDimensions.cardElevation,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppDimensions.cardPadding),
            child: child,
          ),
        ),
      ],
    );
  }

  Widget _buildPersonalInfo(student) {
    return Column(
      children: [
        _buildInfoRow('Birth Date', student?.birthDate != null 
            ? '${student!.birthDate!.day}/${student!.birthDate!.month}/${student!.birthDate!.year}' 
            : 'Not specified'),
        _buildInfoRow('Birth Place', student?.birthPlace ?? 'Not specified'),
        _buildInfoRow('Gender', student?.gender ?? 'Not specified'),
        _buildInfoRow('Civil Status', student?.civilStatus ?? 'Not specified'),
        _buildInfoRow('Nationality', student?.nationality ?? 'Not specified'),
        _buildInfoRow('Religion', student?.religion ?? 'Not specified'),
      ],
    );
  }

  Widget _buildContactInfo(student) {
    return Column(
      children: [
        _buildInfoRow('Email', student?.email ?? 'Not specified'),
        _buildInfoRow('Contact Number', student?.contactNumber ?? 'Not specified'),
        _buildInfoRow('Current Address', student?.address ?? 'Not specified'),
        _buildInfoRow('Permanent Address', student?.permanentAddress ?? 'Not specified'),
      ],
    );
  }

  Widget _buildAcademicSummary(student) {
    return Column(
      children: [
        _buildInfoRow('Course', student?.courseFullName ?? 'Not specified'),
        _buildInfoRow('Major', student?.major ?? 'Not specified'),
        _buildInfoRow('Year Level', 'Year ${student?.yearLevel ?? 1}'),
        _buildInfoRow('Section', student?.section ?? 'Not assigned'),
        _buildInfoRow('Semester', '${student?.semester ?? '1st'} Semester'),
        _buildInfoRow('School Year', student?.schoolYear ?? 'Not specified'),
        _buildInfoRow('Student Status', student?.studentStatus ?? 'Not specified'),
        _buildInfoRow('Scholarship', student?.scholarship ?? 'None'),
        if (student?.latestGrade != null)
          _buildInfoRow('Latest Grade', '${student!.latestGrade}'),
      ],
    );
  }

  Widget _buildEmergencyContact(student) {
    final emergency = student?.emergencyContact;
    return Column(
      children: [
        _buildInfoRow('Name', emergency?.name ?? 'Not specified'),
        _buildInfoRow('Relationship', emergency?.relationship ?? 'Not specified'),
        _buildInfoRow('Contact Number', emergency?.contactNumber ?? 'Not specified'),
        _buildInfoRow('Address', emergency?.address ?? 'Not specified'),
      ],
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppDimensions.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: AppTextStyles.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: AppTextStyles.bodyMedium.copyWith(
                color: AppColors.textPrimary,
              ),
            ),
          ),
        ],
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
        style: AppTextStyles.labelMedium.copyWith(
          color: badgeColor,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}