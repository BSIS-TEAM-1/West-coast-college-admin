import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_provider.dart';
import '../../../shared/widgets/app_bottom_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';
import '../../../core/theme/app_text_styles.dart';

class SupportPage extends StatelessWidget {
  const SupportPage({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final student = authProvider.student;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Support'),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppDimensions.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Contact Information Card
            _buildContactCard(),
            const SizedBox(height: AppDimensions.lg),
            
            // Quick Actions
            const Text(
              'Quick Actions',
              style: AppTextStyles.headlineSmall,
            ),
            const SizedBox(height: AppDimensions.md),
            _buildQuickActions(),
            const SizedBox(height: AppDimensions.lg),
            
            // FAQ Section
            const Text(
              'Frequently Asked Questions',
              style: AppTextStyles.headlineSmall,
            ),
            const SizedBox(height: AppDimensions.md),
            _buildFAQSection(),
            const SizedBox(height: AppDimensions.lg),
            
            // Contact Form
            const Text(
              'Send us a message',
              style: AppTextStyles.headlineSmall,
            ),
            const SizedBox(height: AppDimensions.md),
            _buildContactForm(context),
            const SizedBox(height: AppDimensions.xl),
          ],
        ),
      ),
      bottomNavigationBar: const AppBottomNav(currentPath: '/support'),
    );
  }

  Widget _buildContactCard() {
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
              children: [
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
                  ),
                  child: const Icon(
                    Icons.support_agent,
                    color: AppColors.primary,
                    size: 28,
                  ),
                ),
                const SizedBox(width: AppDimensions.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Student Support',
                        style: AppTextStyles.titleMedium.copyWith(
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: AppDimensions.xs),
                      Text(
                        'We\'re here to help you',
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppDimensions.md),
            const Divider(),
            const SizedBox(height: AppDimensions.md),
            _buildContactItem(
              icon: Icons.phone,
              label: 'Phone',
              value: '(02) 1234-5678',
            ),
            const SizedBox(height: AppDimensions.sm),
            _buildContactItem(
              icon: Icons.email,
              label: 'Email',
              value: 'support@wcc.edu.ph',
            ),
            const SizedBox(height: AppDimensions.sm),
            _buildContactItem(
              icon: Icons.location_on,
              label: 'Office',
              value: 'Student Affairs Office, Ground Floor',
            ),
            const SizedBox(height: AppDimensions.sm),
            _buildContactItem(
              icon: Icons.access_time,
              label: 'Hours',
              value: 'Mon-Fri: 8:00 AM - 5:00 PM',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContactItem({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        Icon(
          icon,
          size: 20,
          color: AppColors.textMuted,
        ),
        const SizedBox(width: AppDimensions.md),
        Text(
          '$label: ',
          style: AppTextStyles.bodyMedium.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: AppTextStyles.bodyMedium.copyWith(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildQuickActions() {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: AppDimensions.md,
      crossAxisSpacing: AppDimensions.md,
      children: [
        _buildQuickActionCard(
          icon: Icons.chat,
          label: 'Live Chat',
          onTap: () {},
        ),
        _buildQuickActionCard(
          icon: Icons.calendar_today,
          label: 'Book Appointment',
          onTap: () {},
        ),
        _buildQuickActionCard(
          icon: Icons.report_problem,
          label: 'Report Issue',
          onTap: () {},
        ),
        _buildQuickActionCard(
          icon: Icons.help_outline,
          label: 'Help Center',
          onTap: () {},
        ),
      ],
    );
  }

  Widget _buildQuickActionCard({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      child: Card(
        elevation: AppDimensions.cardElevation,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppDimensions.cardPadding),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                color: AppColors.primary,
                size: AppDimensions.iconXLarge,
              ),
              const SizedBox(height: AppDimensions.sm),
              Text(
                label,
                style: AppTextStyles.bodyMedium.copyWith(
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFAQSection() {
    final faqs = [
      {
        'question': 'How do I reset my password?',
        'answer': 'You can reset your password by clicking "Forgot Password" on the login screen. You will receive a password reset link via email.',
      },
      {
        'question': 'Where can I find my grades?',
        'answer': 'Your grades are available in the Grades section of the app. You can view current semester grades, previous semester grades, and your overall GPA.',
      },
      {
        'question': 'How do I request documents?',
        'answer': 'Go to the Documents section and select the Available tab. Tap the + button next to the document you want to request. You will be notified when it\'s ready.',
      },
      {
        'question': 'Who do I contact for enrollment issues?',
        'answer': 'For enrollment-related concerns, please visit the Registrar Office or contact them at registrar@wcc.edu.ph.',
      },
    ];

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: faqs.length,
      separatorBuilder: (context, index) => const SizedBox(height: AppDimensions.sm),
      itemBuilder: (context, index) {
        final faq = faqs[index];
        return Card(
          elevation: AppDimensions.cardElevation,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
          ),
          child: ExpansionTile(
            title: Text(
              faq['question'] as String,
              style: AppTextStyles.bodyMedium.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w500,
              ),
            ),
            children: [
              Padding(
                padding: const EdgeInsets.all(AppDimensions.md),
                child: Text(
                  faq['answer'] as String,
                  style: AppTextStyles.bodyMedium.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildContactForm(BuildContext context) {
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
              'Send us a message',
              style: AppTextStyles.bodyMedium,
            ),
            const SizedBox(height: AppDimensions.md),
            TextFormField(
              decoration: const InputDecoration(
                labelText: 'Subject',
                hintText: 'Enter subject',
              ),
            ),
            const SizedBox(height: AppDimensions.md),
            TextFormField(
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Message',
                hintText: 'Describe your issue or question',
              ),
            ),
            const SizedBox(height: AppDimensions.md),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Message sent successfully'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                },
                child: const Text('Send Message'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}