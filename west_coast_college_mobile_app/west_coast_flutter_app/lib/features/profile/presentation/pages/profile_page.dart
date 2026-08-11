import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
import '../../../../core/widgets/error_state.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../../../core/widgets/student_avatar.dart';
import '../../../../shared/widgets/app_bottom_nav.dart';
import '../../domain/entities/profile_entity.dart';
import '../providers/auth_logout_action.dart';
import '../providers/cor_service.dart';
import '../providers/profile_controller.dart';
import 'edit_profile_page.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(profileControllerProvider);
    final colors = ThemeColors.of(context);

    return Scaffold(
      backgroundColor: colors.backgroundSoft,
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: colors.primary,
        foregroundColor: colors.onPrimary,
      ),
      body: _buildBody(context, ref, state, colors),
      bottomNavigationBar: const AppBottomNav(currentPath: '/profile'),
    );
  }

  Widget _buildBody(BuildContext context, WidgetRef ref, ProfileState state, ThemeColors colors) {
    return switch (state) {
      ProfileLoading() => Center(child: CircularProgressIndicator(color: colors.primary)),
      ProfileFailed(:final message) => Center(
          child: ErrorState(
            message: message,
            onRetry: () => ref.read(profileControllerProvider.notifier).load(),
          ),
        ),
      ProfileLoaded(:final profile) => RefreshIndicator(
          onRefresh: () => ref.read(profileControllerProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.all(AppDimensions.md),
            children: [
              _ProfileHeader(profile: profile, colors: colors),
              const SizedBox(height: AppDimensions.lg),
              _SectionCard(
                title: 'Academic Information',
                colors: colors,
                children: [
                  _InfoRow('Student Number', profile.studentNumber, colors),
                  _InfoRow('Program', _courseLabel(profile.course), colors),
                  if (profile.major != null) _InfoRow('Major', profile.major!, colors),
                  _InfoRow('Year Level', 'Year ${profile.yearLevel}', colors),
                  if (profile.section != null) _InfoRow('Section', profile.section!, colors),
                  if (profile.semester != null) _InfoRow('Semester', profile.semester!, colors),
                  if (profile.schoolYear != null) _InfoRow('School Year', profile.schoolYear!, colors),
                  if (profile.studentStatus != null)
                    _InfoRowWithBadge('Student Status', profile.studentStatus!, _statusTone(profile.studentStatus!), colors),
                  if (profile.enrollmentStatus != null)
                    _InfoRow('Enrollment Status', profile.enrollmentStatus!, colors),
                  if (profile.scholarship != null && profile.scholarship!.isNotEmpty)
                    _InfoRow('Scholarship', profile.scholarship!, colors),
                ],
              ),
              const SizedBox(height: AppDimensions.md),
              _SectionCard(
                title: 'Personal Information',
                colors: colors,
                children: [
                  _InfoRow('Full Name', profile.fullName, colors),
                  if (profile.birthDate != null)
                    _InfoRow('Birth Date', DateFormat('MMM d, y').format(profile.birthDate!), colors),
                  if (profile.birthPlace != null) _InfoRow('Birth Place', profile.birthPlace!, colors),
                  if (profile.gender != null) _InfoRow('Gender', profile.gender!, colors),
                  if (profile.civilStatus != null) _InfoRow('Civil Status', profile.civilStatus!, colors),
                  if (profile.nationality != null) _InfoRow('Nationality', profile.nationality!, colors),
                  if (profile.religion != null) _InfoRow('Religion', profile.religion!, colors),
                ],
              ),
              const SizedBox(height: AppDimensions.md),
              _SectionCard(
                title: 'Contact Information',
                colors: colors,
                children: [
                  _InfoRow('Email', profile.email, colors),
                  if (profile.contactNumber != null) _InfoRow('Contact Number', profile.contactNumber!, colors),
                  if (profile.address != null) _InfoRow('Address', profile.address!, colors),
                  if (profile.permanentAddress != null) _InfoRow('Permanent Address', profile.permanentAddress!, colors),
                ],
              ),
              if (profile.emergencyContact != null) ...[
                const SizedBox(height: AppDimensions.md),
                _SectionCard(
                  title: 'Emergency Contact',
                  colors: colors,
                  children: [
                    _InfoRow('Name', profile.emergencyContact!.name, colors),
                    _InfoRow('Relationship', profile.emergencyContact!.relationship, colors),
                    _InfoRow('Contact Number', profile.emergencyContact!.contactNumber, colors),
                    if (profile.emergencyContact!.address != null)
                      _InfoRow('Address', profile.emergencyContact!.address!, colors),
                  ],
                ),
              ],
              const SizedBox(height: AppDimensions.lg),
              _EditProfileButton(profile: profile, colors: colors),
              const SizedBox(height: AppDimensions.lg),
              _CorCard(profile: profile, colors: colors),
              const SizedBox(height: AppDimensions.md),
              _LogoutButton(colors: colors),
              const SizedBox(height: AppDimensions.xl),
            ],
          ),
        ),
    };
  }

  String _courseLabel(int code) => switch (code) {
        101 => 'BEED',
        102 => 'BSEd-English',
        103 => 'BSEd-Math',
        201 => 'BSBA-HRM',
        _ => 'Course $code',
      };

  StatusTone _statusTone(String status) => switch (status.toLowerCase()) {
        'enrolled' => StatusTone.success,
        'pending' => StatusTone.warning,
        _ => StatusTone.neutral,
      };
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.profile, required this.colors});
  final ProfileEntity profile;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppDimensions.cardPadding),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusLarge),
        boxShadow: [BoxShadow(color: colors.divider.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Row(
        children: [
          StudentAvatar(name: profile.fullName.isEmpty ? profile.firstName : profile.fullName, size: 64),
          const SizedBox(width: AppDimensions.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(profile.fullName, style: AppTextStyles.titleLarge.copyWith(fontSize: 18, color: colors.textBold)),
                const SizedBox(height: 2),
                Text(profile.studentNumber, style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.colors, required this.children});
  final String title;
  final ThemeColors colors;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppDimensions.md, AppDimensions.md, AppDimensions.md, AppDimensions.sm),
            child: Text(title, style: AppTextStyles.headlineSmall.copyWith(fontSize: 15, color: colors.textBold)),
          ),
          Divider(height: 1, color: colors.divider),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(this.label, this.value, this.colors);
  final String label;
  final String value;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppDimensions.md, vertical: AppDimensions.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted)),
          ),
          Expanded(child: Text(value, style: AppTextStyles.bodyMedium.copyWith(color: colors.textPrimary))),
        ],
      ),
    );
  }
}

class _InfoRowWithBadge extends StatelessWidget {
  const _InfoRowWithBadge(this.label, this.value, this.tone, this.colors);
  final String label;
  final String value;
  final StatusTone tone;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppDimensions.md, vertical: AppDimensions.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: AppTextStyles.bodySmall.copyWith(color: colors.textMuted)),
          ),
          StatusBadge(label: value, tone: tone),
        ],
      ),
    );
  }
}

class _CorCard extends ConsumerStatefulWidget {
  const _CorCard({required this.profile, required this.colors});
  final ProfileEntity profile;
  final ThemeColors colors;

  @override
  ConsumerState<_CorCard> createState() => _CorCardState();
}

class _CorCardState extends ConsumerState<_CorCard> {
  bool _downloading = false;
  String? _error;

  Future<void> _downloadCor() async {
    setState(() {
      _downloading = true;
      _error = null;
    });
    try {
      final bytes = await ref.read(corServiceProvider).downloadCorPdf();
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/COR-${widget.profile.studentNumber}.pdf');
      await file.writeAsBytes(bytes);
      if (mounted) {
        await Share.shareXFiles([XFile(file.path)], text: 'Certificate of Registration — ${widget.profile.fullName}');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'We couldn\'t download your COR. Please check your connection and try again.';
        });
      }
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppDimensions.cardPadding),
      decoration: BoxDecoration(
        color: widget.colors.primarySubtle,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.description_outlined, color: widget.colors.primary),
              const SizedBox(width: AppDimensions.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Certificate of Registration', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w700, color: widget.colors.textPrimary)),
                    if (widget.profile.corStatus != null)
                      Text('Status: ${widget.profile.corStatus}', style: AppTextStyles.caption.copyWith(color: widget.colors.textMuted)),
                  ],
                ),
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: AppDimensions.sm),
            Text(_error!, style: AppTextStyles.error),
          ],
          const SizedBox(height: AppDimensions.sm),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _downloading ? null : _downloadCor,
              icon: _downloading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: _onPrimaryTint),
                    )
                  : const Icon(Icons.download_outlined, size: 18),
              label: Text(_downloading ? 'Preparing…' : 'Download & Share COR'),
            ),
          ),
        ],
      ),
    );
  }
}

const Color _onPrimaryTint = Color(0xFFFFFFFF);

class _LogoutButton extends ConsumerWidget {
  const _LogoutButton({required this.colors});
  final ThemeColors colors;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: () => _showLogoutDialog(context, ref),
        icon: Icon(Icons.logout, color: colors.error),
        label: Text('Log Out', style: TextStyle(color: colors.error)),
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: colors.error),
          padding: const EdgeInsets.symmetric(vertical: AppDimensions.sm),
        ),
      ),
    );
  }

  void _showLogoutDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Log Out'),
        content: const Text('Are you sure you want to log out of WCConnect?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              ref.read(logoutActionProvider)(ref);
            },
            style: FilledButton.styleFrom(backgroundColor: colors.error),
            child: const Text('Log Out'),
          ),
        ],
      ),
    );
  }
}

class _EditProfileButton extends StatelessWidget {
  const _EditProfileButton({required this.profile, required this.colors});
  final ProfileEntity profile;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: AppDimensions.buttonHeightLarge,
      child: OutlinedButton.icon(
        onPressed: () async {
          final result = await Navigator.of(context).push<bool>(
            MaterialPageRoute(builder: (_) => EditProfilePage(profile: profile)),
          );
          if (result == true && context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Profile updated successfully.'),
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        },
        icon: Icon(Icons.edit_outlined, size: 20, color: colors.primary),
        label: Text(
          'EDIT PROFILE',
          style: TextStyle(
            color: colors.primary,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: colors.primary),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppDimensions.radiusSmall)),
        ),
      ),
    );
  }
}
