import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_provider.dart';
import '../../../shared/widgets/app_bottom_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';
import '../../../core/theme/app_text_styles.dart';

class AnnouncementsPage extends StatefulWidget {
  const AnnouncementsPage({super.key});

  @override
  State<AnnouncementsPage> createState() => _AnnouncementsPageState();
}

class _AnnouncementsPageState extends State<AnnouncementsPage> {
  List<String> _selectedFilters = ['All'];

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final student = authProvider.student;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Announcements'),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () => _showFilterDialog(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter Chips
          _buildFilterChips(),
          const Divider(),
          
          // Announcements List
          Expanded(
            child: _buildAnnouncementsList(),
          ),
        ],
      ),
      bottomNavigationBar: const AppBottomNav(currentPath: '/announcements'),
    );
  }

  Widget _buildFilterChips() {
    final filters = ['All', 'Academic', 'Events', 'Important', 'General'];
    
    return Container(
      height: 60,
      padding: const EdgeInsets.symmetric(horizontal: AppDimensions.lg),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: filters.length,
        itemBuilder: (context, index) {
          final filter = filters[index];
          final isSelected = _selectedFilters.contains(filter);
          
          return Padding(
            padding: const EdgeInsets.only(right: AppDimensions.sm),
            child: FilterChip(
              label: Text(filter),
              selected: isSelected,
              onSelected: (selected) {
                setState(() {
                  if (selected) {
                    _selectedFilters = [filter];
                  } else {
                    _selectedFilters = ['All'];
                  }
                });
              },
              selectedColor: AppColors.primary,
              labelStyle: AppTextStyles.bodySmall.copyWith(
                color: isSelected ? AppColors.onPrimary : AppColors.textPrimary,
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildAnnouncementsList() {
    final announcements = _getSampleAnnouncements();
    final filteredAnnouncements = _selectedFilters.contains('All')
        ? announcements
        : announcements.where((a) => a.category == _selectedFilters.first).toList();

    if (filteredAnnouncements.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.announcement_outlined,
              size: 64,
              color: AppColors.textMuted,
            ),
            const SizedBox(height: AppDimensions.md),
            Text(
              'No announcements found',
              style: AppTextStyles.bodyMedium.copyWith(
                color: AppColors.textMuted,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(AppDimensions.lg),
      itemCount: filteredAnnouncements.length,
      itemBuilder: (context, index) {
        final announcement = filteredAnnouncements[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: AppDimensions.md),
          child: _buildAnnouncementCard(announcement),
        );
      },
    );
  }

  Widget _buildAnnouncementCard(AnnouncementItem announcement) {
    return Card(
      elevation: announcement.isUrgent ? AppDimensions.elevationMedium : AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
        side: announcement.isUrgent
            ? BorderSide(color: AppColors.warning, width: 2)
            : BorderSide.none,
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppDimensions.cardPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                _buildCategoryBadge(announcement.category),
                const SizedBox(width: AppDimensions.sm),
                if (announcement.isUrgent)
                  _buildUrgentBadge(),
                const Spacer(),
                Text(
                  _formatDate(announcement.date),
                  style: AppTextStyles.bodySmall.copyWith(
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppDimensions.md),
            
            // Title
            Text(
              announcement.title,
              style: AppTextStyles.titleMedium.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppDimensions.sm),
            
            // Message
            Text(
              announcement.message,
              style: AppTextStyles.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: AppDimensions.md),
            
            // Footer
            Row(
              children: [
                Icon(
                  Icons.person,
                  size: 16,
                  color: AppColors.textMuted,
                ),
                const SizedBox(width: AppDimensions.xs),
                Text(
                  announcement.author,
                  style: AppTextStyles.bodySmall.copyWith(
                    color: AppColors.textMuted,
                  ),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => _showAnnouncementDetails(announcement),
                  child: Text(
                    'Read More',
                    style: AppTextStyles.link,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryBadge(String category) {
    Color color;
    
    switch (category) {
      case 'Academic':
        color = AppColors.primary;
        break;
      case 'Events':
        color = AppColors.info;
        break;
      case 'Important':
        color = AppColors.warning;
        break;
      case 'General':
        color = AppColors.success;
        break;
      default:
        color = AppColors.textMuted;
    }

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppDimensions.sm,
        vertical: AppDimensions.xs,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppDimensions.radiusSmall),
      ),
      child: Text(
        category,
        style: AppTextStyles.labelSmall.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildUrgentBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppDimensions.sm,
        vertical: AppDimensions.xs,
      ),
      decoration: BoxDecoration(
        color: AppColors.error.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppDimensions.radiusSmall),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.priority_high,
            size: 12,
            color: AppColors.error,
          ),
          const SizedBox(width: 2),
          Text(
            'Urgent',
            style: AppTextStyles.labelSmall.copyWith(
              color: AppColors.error,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);
    
    if (difference.inDays == 0) {
      return 'Today';
    } else if (difference.inDays == 1) {
      return 'Yesterday';
    } else if (difference.inDays < 7) {
      return '${difference.inDays} days ago';
    } else {
      return '${date.day}/${date.month}/${date.year}';
    }
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Filter Announcements'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Select category to filter:'),
            const SizedBox(height: AppDimensions.md),
            Wrap(
              spacing: AppDimensions.sm,
              children: ['All', 'Academic', 'Events', 'Important', 'General']
                  .map((filter) => FilterChip(
                        label: Text(filter),
                        selected: _selectedFilters.contains(filter),
                        onSelected: (selected) {
                          setState(() {
                            if (selected) {
                              _selectedFilters = [filter];
                            } else {
                              _selectedFilters = ['All'];
                            }
                          });
                          Navigator.pop(context);
                        },
                      ))
                  .toList(),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _showAnnouncementDetails(AnnouncementItem announcement) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            _buildCategoryBadge(announcement.category),
            const SizedBox(width: AppDimensions.sm),
            if (announcement.isUrgent) _buildUrgentBadge(),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                announcement.title,
                style: AppTextStyles.headlineSmall,
              ),
              const SizedBox(height: AppDimensions.sm),
              Text(
                _formatDate(announcement.date),
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.textMuted,
                ),
              ),
              const SizedBox(height: AppDimensions.md),
              const Divider(),
              const SizedBox(height: AppDimensions.md),
              Text(
                announcement.message,
                style: AppTextStyles.bodyMedium,
              ),
              const SizedBox(height: AppDimensions.md),
              const Divider(),
              const SizedBox(height: AppDimensions.sm),
              Text(
                'Posted by: ${announcement.author}',
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.textMuted,
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  List<AnnouncementItem> _getSampleAnnouncements() {
    return [
      AnnouncementItem(
        title: 'Midterm Examination Schedule',
        message: 'Midterm examinations will start on October 15, 2025. Please check your examination schedule posted on the bulletin board. Ensure you are prepared and bring necessary materials.',
        category: 'Academic',
        date: DateTime.now().subtract(const Duration(days: 1)),
        author: 'Registrar Office',
        isUrgent: true,
      ),
      AnnouncementItem(
        title: 'Holiday Announcement',
        message: 'The college will be closed on August 30, 2025 in observance of National Heroes Day. Classes will resume on August 31, 2025.',
        category: 'Important',
        date: DateTime.now().subtract(const Duration(days: 2)),
        author: 'Administration',
        isUrgent: true,
      ),
      AnnouncementItem(
        title: 'Sports Festival Registration',
        message: 'Registration for the annual sports festival is now open. Please sign up at the Student Affairs office before September 15, 2025. Various sports categories are available.',
        category: 'Events',
        date: DateTime.now().subtract(const Duration(days: 3)),
        author: 'Student Affairs',
        isUrgent: false,
      ),
      AnnouncementItem(
        title: 'Library Hours Update',
        message: 'The library will have extended hours starting next week. New schedule: Monday-Friday 7:00 AM - 8:00 PM, Saturday 8:00 AM - 5:00 PM.',
        category: 'General',
        date: DateTime.now().subtract(const Duration(days: 5)),
        author: 'Library',
        isUrgent: false,
      ),
      AnnouncementItem(
        title: 'Grade Release Notification',
        message: 'Grades for the previous semester have been released. Students may view their grades through the student portal or visit the registrar office.',
        category: 'Academic',
        date: DateTime.now().subtract(const Duration(days: 7)),
        author: 'Registrar Office',
        isUrgent: false,
      ),
    ];
  }
}

class AnnouncementItem {
  final String title;
  final String message;
  final String category;
  final DateTime date;
  final String author;
  final bool isUrgent;

  AnnouncementItem({
    required this.title,
    required this.message,
    required this.category,
    required this.date,
    required this.author,
    required this.isUrgent,
  });
}