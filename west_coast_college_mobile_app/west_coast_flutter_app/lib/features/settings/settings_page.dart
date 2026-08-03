import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_provider.dart';
import '../../../shared/widgets/app_bottom_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';
import '../../../core/theme/app_text_styles.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final student = authProvider.student;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppDimensions.lg),
        children: [
          // Account Section
          _buildSectionHeader('Account'),
          const SizedBox(height: AppDimensions.md),
          _buildAccountCard(student),
          const SizedBox(height: AppDimensions.lg),
          
          // App Settings
          _buildSectionHeader('App Settings'),
          const SizedBox(height: AppDimensions.md),
          _buildAppSettings(),
          const SizedBox(height: AppDimensions.lg),
          
          // Notifications
          _buildSectionHeader('Notifications'),
          const SizedBox(height: AppDimensions.md),
          _buildNotificationSettings(),
          const SizedBox(height: AppDimensions.lg),
          
          // Privacy & Security
          _buildSectionHeader('Privacy & Security'),
          const SizedBox(height: AppDimensions.md),
          _buildPrivacySettings(),
          const SizedBox(height: AppDimensions.lg),
          
          // About
          _buildSectionHeader('About'),
          const SizedBox(height: AppDimensions.md),
          _buildAboutSection(),
          const SizedBox(height: AppDimensions.xl),
          
          // Logout Button
          _buildLogoutButton(context, authProvider),
          const SizedBox(height: AppDimensions.xl),
        ],
      ),
      bottomNavigationBar: const AppBottomNav(currentPath: '/profile'),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: AppTextStyles.headlineSmall,
    );
  }

  Widget _buildAccountCard(student) {
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
                borderRadius: BorderRadius.circular(AppDimensions.radiusRound),
              ),
              child: const Icon(
                Icons.person,
                size: 32,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: AppDimensions.md),
            
            // Account Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    student?.fullName ?? 'Student Name',
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Text(
                    student?.email ?? 'student@wcc.edu.ph',
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            
            // Edit Button
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () {},
              color: AppColors.primary,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAppSettings() {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Column(
        children: [
          _buildSettingTile(
            icon: Icons.language,
            title: 'Language',
            subtitle: 'English',
            onTap: () {},
          ),
          const Divider(),
          _buildSettingTile(
            icon: Icons.brightness_6,
            title: 'Theme',
            subtitle: 'System default',
            onTap: () {},
          ),
          const Divider(),
          _buildSettingTile(
            icon: Icons.text_fields,
            title: 'Font Size',
            subtitle: 'Medium',
            onTap: () {},
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationSettings() {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Column(
        children: [
          _buildSwitchTile(
            icon: Icons.notifications,
            title: 'Push Notifications',
            subtitle: 'Receive notifications on your device',
            value: true,
            onChanged: (value) {},
          ),
          const Divider(),
          _buildSwitchTile(
            icon: Icons.email,
            title: 'Email Notifications',
            subtitle: 'Receive updates via email',
            value: true,
            onChanged: (value) {},
          ),
          const Divider(),
          _buildSwitchTile(
            icon: Icons.announcement,
            title: 'Important Announcements',
            subtitle: 'Get notified for urgent announcements',
            value: true,
            onChanged: (value) {},
          ),
          const Divider(),
          _buildSwitchTile(
            icon: Icons.school,
            title: 'Grade Updates',
            subtitle: 'Notify when grades are posted',
            value: true,
            onChanged: (value) {},
          ),
        ],
      ),
    );
  }

  Widget _buildPrivacySettings() {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Column(
        children: [
          _buildSettingTile(
            icon: Icons.lock,
            title: 'Change Password',
            subtitle: 'Update your password',
            onTap: () {},
          ),
          const Divider(),
          _buildSettingTile(
            icon: Icons.fingerprint,
            title: 'Biometric Login',
            subtitle: 'Use fingerprint or face recognition',
            onTap: () {},
          ),
          const Divider(),
          _buildSettingTile(
            icon: Icons.privacy_tip,
            title: 'Privacy Policy',
            subtitle: 'View our privacy policy',
            onTap: () {},
          ),
          const Divider(),
          _buildSettingTile(
            icon: Icons.description,
            title: 'Terms of Service',
            subtitle: 'View terms and conditions',
            onTap: () {},
          ),
        ],
      ),
    );
  }

  Widget _buildAboutSection() {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Column(
        children: [
          _buildSettingTile(
            icon: Icons.info,
            title: 'App Version',
            subtitle: '1.0.0',
            onTap: () {},
          ),
          const Divider(),
          _buildSettingTile(
            icon: Icons.update,
            title: 'Check for Updates',
            subtitle: 'You have the latest version',
            onTap: () {},
          ),
          const Divider(),
          _buildSettingTile(
            icon: Icons.help,
            title: 'Help & Support',
            subtitle: 'Get help with the app',
            onTap: () {},
          ),
          const Divider(),
          _buildSettingTile(
            icon: Icons.star,
            title: 'Rate the App',
            subtitle: 'Share your feedback',
            onTap: () {},
          ),
        ],
      ),
    );
  }

  Widget _buildSettingTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Icon(icon, color: AppColors.primary),
      title: Text(
        title,
        style: AppTextStyles.bodyMedium.copyWith(
          color: AppColors.textPrimary,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: AppTextStyles.bodySmall.copyWith(
          color: AppColors.textMuted,
        ),
      ),
      trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
      onTap: onTap,
    );
  }

  Widget _buildSwitchTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return ListTile(
      leading: Icon(icon, color: AppColors.primary),
      title: Text(
        title,
        style: AppTextStyles.bodyMedium.copyWith(
          color: AppColors.textPrimary,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: AppTextStyles.bodySmall.copyWith(
          color: AppColors.textMuted,
        ),
      ),
      trailing: Switch(
        value: value,
        onChanged: onChanged,
        activeColor: AppColors.primary,
      ),
    );
  }

  Widget _buildLogoutButton(BuildContext context, AuthProvider authProvider) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: () => _showLogoutDialog(context, authProvider),
        icon: const Icon(Icons.logout),
        label: const Text('Logout'),
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.error,
          side: const BorderSide(color: AppColors.error),
          padding: const EdgeInsets.symmetric(vertical: AppDimensions.md),
        ),
      ),
    );
  }

  void _showLogoutDialog(BuildContext context, AuthProvider authProvider) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              authProvider.logout();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: AppColors.onPrimary,
            ),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }
}