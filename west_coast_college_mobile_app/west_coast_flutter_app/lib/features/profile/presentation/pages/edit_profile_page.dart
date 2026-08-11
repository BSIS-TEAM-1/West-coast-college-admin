import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_dimensions.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/theme_colors.dart';
import '../../domain/entities/profile_entity.dart';
import '../providers/profile_controller.dart';

class EditProfilePage extends ConsumerStatefulWidget {
  const EditProfilePage({super.key, required this.profile});
  final ProfileEntity profile;

  @override
  ConsumerState<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends ConsumerState<EditProfilePage> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;
  late final TextEditingController _contactNumberController;
  late final TextEditingController _addressController;
  late final TextEditingController _permanentAddressController;
  late final TextEditingController _birthPlaceController;
  late final TextEditingController _nationalityController;
  late final TextEditingController _religionController;
  late final TextEditingController _ecNameController;
  late final TextEditingController _ecRelationshipController;
  late final TextEditingController _ecContactController;
  late final TextEditingController _ecAddressController;

  late String? _gender;
  late String? _civilStatus;
  late DateTime? _birthDate;

  @override
  void initState() {
    super.initState();
    final p = widget.profile;
    _emailController = TextEditingController(text: p.email);
    _contactNumberController = TextEditingController(text: p.contactNumber ?? '');
    _addressController = TextEditingController(text: p.address ?? '');
    _permanentAddressController = TextEditingController(text: p.permanentAddress ?? '');
    _birthPlaceController = TextEditingController(text: p.birthPlace ?? '');
    _nationalityController = TextEditingController(text: p.nationality ?? '');
    _religionController = TextEditingController(text: p.religion ?? '');
    _ecNameController = TextEditingController(text: p.emergencyContact?.name ?? '');
    _ecRelationshipController = TextEditingController(text: p.emergencyContact?.relationship ?? '');
    _ecContactController = TextEditingController(text: p.emergencyContact?.contactNumber ?? '');
    _ecAddressController = TextEditingController(text: p.emergencyContact?.address ?? '');
    _gender = p.gender;
    _civilStatus = p.civilStatus;
    _birthDate = p.birthDate;
  }

  @override
  void dispose() {
    _emailController.dispose();
    _contactNumberController.dispose();
    _addressController.dispose();
    _permanentAddressController.dispose();
    _birthPlaceController.dispose();
    _nationalityController.dispose();
    _religionController.dispose();
    _ecNameController.dispose();
    _ecRelationshipController.dispose();
    _ecContactController.dispose();
    _ecAddressController.dispose();
    super.dispose();
  }

  Future<void> _pickBirthDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _birthDate ?? DateTime(2000),
      firstDate: DateTime(1950),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _birthDate = picked);
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final updates = <String, dynamic>{
      'email': _emailController.text.trim(),
      'contactNumber': _contactNumberController.text.trim(),
      'address': _addressController.text.trim(),
      'permanentAddress': _permanentAddressController.text.trim(),
      'birthPlace': _birthPlaceController.text.trim(),
      'nationality': _nationalityController.text.trim(),
      'religion': _religionController.text.trim(),
      'gender': _gender,
      'civilStatus': _civilStatus,
      if (_birthDate != null) 'birthDate': _birthDate!.toIso8601String(),
      'emergencyContact': {
        'name': _ecNameController.text.trim(),
        'relationship': _ecRelationshipController.text.trim(),
        'contactNumber': _ecContactController.text.trim(),
        if (_ecAddressController.text.trim().isNotEmpty)
          'address': _ecAddressController.text.trim(),
      },
    };

    final success = await ref.read(profileControllerProvider.notifier).updateProfile(updates);
    if (mounted) {
      if (success) {
        Navigator.of(context).pop(true);
      } else {
        // Show error snackbar
        final state = ref.read(profileControllerProvider);
        final errorMsg = state is ProfileLoaded ? state.saveError : 'Failed to update profile.';
        if (errorMsg != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(errorMsg), backgroundColor: Theme.of(context).colorScheme.error),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = ThemeColors.of(context);
    final state = ref.watch(profileControllerProvider);
    final isSaving = state is ProfileLoaded && state.isSaving;

    return Scaffold(
      backgroundColor: colors.backgroundSoft,
      appBar: AppBar(
        title: const Text('Edit Profile'),
        backgroundColor: colors.primary,
        foregroundColor: colors.onPrimary,
        actions: [
          TextButton(
            onPressed: isSaving ? null : _save,
            child: Text(
              'SAVE',
              style: TextStyle(
                color: colors.onPrimary,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.2,
              ),
            ),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(AppDimensions.md),
          children: [
            _SectionTitle('Contact Information', colors),
            _SectionCard(colors: colors, children: [
              _TextField(
                controller: _emailController,
                label: 'Email',
                hint: 'you@example.com',
                keyboardType: TextInputType.emailAddress,
                validator: (v) {
                  final val = v?.trim() ?? '';
                  if (val.isEmpty) return 'Email is required.';
                  if (!RegExp(r'^\S+@\S+\.\S+$').hasMatch(val)) return 'Enter a valid email.';
                  return null;
                },
                colors: colors,
              ),
              _TextField(
                controller: _contactNumberController,
                label: 'Contact Number',
                hint: '09XX XXX XXXX',
                keyboardType: TextInputType.phone,
                colors: colors,
              ),
              _TextField(
                controller: _addressController,
                label: 'Current Address',
                hint: 'Barangay, City, Province',
                colors: colors,
              ),
              _TextField(
                controller: _permanentAddressController,
                label: 'Permanent Address',
                hint: 'Barangay, City, Province',
                colors: colors,
              ),
            ]),
            const SizedBox(height: AppDimensions.md),

            _SectionTitle('Personal Information', colors),
            _SectionCard(colors: colors, children: [
              _DatePickerField(
                label: 'Birth Date',
                value: _birthDate,
                onTap: _pickBirthDate,
                colors: colors,
              ),
              _TextField(
                controller: _birthPlaceController,
                label: 'Birth Place',
                hint: 'City, Province',
                colors: colors,
              ),
              _DropdownField(
                label: 'Gender',
                value: _gender,
                items: const ['Male', 'Female'],
                onChanged: (v) => setState(() => _gender = v),
                colors: colors,
              ),
              _DropdownField(
                label: 'Civil Status',
                value: _civilStatus,
                items: const ['Single', 'Married', 'Divorced', 'Widowed'],
                onChanged: (v) => setState(() => _civilStatus = v),
                colors: colors,
              ),
              _TextField(
                controller: _nationalityController,
                label: 'Nationality',
                hint: 'Filipino',
                colors: colors,
              ),
              _TextField(
                controller: _religionController,
                label: 'Religion',
                hint: 'Roman Catholic',
                colors: colors,
              ),
            ]),
            const SizedBox(height: AppDimensions.md),

            _SectionTitle('Emergency Contact', colors),
            _SectionCard(colors: colors, children: [
              _TextField(
                controller: _ecNameController,
                label: 'Name',
                hint: 'Full name of emergency contact',
                colors: colors,
              ),
              _TextField(
                controller: _ecRelationshipController,
                label: 'Relationship',
                hint: 'Parent / Guardian / Sibling',
                colors: colors,
              ),
              _TextField(
                controller: _ecContactController,
                label: 'Contact Number',
                hint: '09XX XXX XXXX',
                keyboardType: TextInputType.phone,
                colors: colors,
              ),
              _TextField(
                controller: _ecAddressController,
                label: 'Address',
                hint: 'Optional',
                colors: colors,
              ),
            ]),
            const SizedBox(height: AppDimensions.xl),

            if (isSaving)
              const Center(child: CircularProgressIndicator()),
            const SizedBox(height: AppDimensions.xl),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text, this.colors);
  final String text;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppDimensions.sm),
      child: Text(
        text,
        style: AppTextStyles.labelLarge.copyWith(
          color: colors.textBold,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.colors, required this.children});
  final ThemeColors colors;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppDimensions.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
        border: Border.all(color: colors.border),
      ),
      child: Column(children: children),
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.colors,
    this.keyboardType,
    this.validator,
  });
  final TextEditingController controller;
  final String label;
  final String hint;
  final ThemeColors colors;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppDimensions.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppTextStyles.labelMedium.copyWith(color: colors.textSecondary)),
          const SizedBox(height: 4),
          TextFormField(
            controller: controller,
            keyboardType: keyboardType,
            validator: validator,
            decoration: InputDecoration(
              hintText: hint,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppDimensions.radiusSmall)),
              filled: true,
              fillColor: colors.backgroundSoft,
            ),
          ),
        ],
      ),
    );
  }
}

class _DropdownField extends StatelessWidget {
  const _DropdownField({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
    required this.colors,
  });
  final String label;
  final String? value;
  final List<String> items;
  final ValueChanged<String?> onChanged;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppDimensions.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppTextStyles.labelMedium.copyWith(color: colors.textSecondary)),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            value: value,
            decoration: InputDecoration(
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppDimensions.radiusSmall)),
              filled: true,
              fillColor: colors.backgroundSoft,
            ),
            items: items.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
            onChanged: onChanged,
            hint: Text('Select $label'),
          ),
        ],
      ),
    );
  }
}

class _DatePickerField extends StatelessWidget {
  const _DatePickerField({
    required this.label,
    required this.value,
    required this.onTap,
    required this.colors,
  });
  final String label;
  final DateTime? value;
  final VoidCallback onTap;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppDimensions.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppTextStyles.labelMedium.copyWith(color: colors.textSecondary)),
          const SizedBox(height: 4),
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppDimensions.radiusSmall),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              decoration: BoxDecoration(
                border: Border.all(color: colors.border),
                borderRadius: BorderRadius.circular(AppDimensions.radiusSmall),
                color: colors.backgroundSoft,
              ),
              child: Row(
                children: [
                  Icon(Icons.calendar_today_outlined, size: 18, color: colors.textMuted),
                  const SizedBox(width: 8),
                  Text(
                    value != null
                        ? '${value!.month}/${value!.day}/${value!.year}'
                        : 'Tap to select date',
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: value != null ? colors.textPrimary : colors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
