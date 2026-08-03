import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_provider.dart';
import '../../../shared/widgets/app_bottom_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';
import '../../../core/theme/app_text_styles.dart';

class SchedulePage extends StatefulWidget {
  const SchedulePage({super.key});

  @override
  State<SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends State<SchedulePage> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 7, vsync: this);
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
        title: const Text('Schedule'),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.onPrimary,
          labelColor: AppColors.onPrimary,
          unselectedLabelColor: AppColors.onPrimary.withOpacity(0.7),
          isScrollable: true,
          tabs: const [
            Tab(text: 'Mon'),
            Tab(text: 'Tue'),
            Tab(text: 'Wed'),
            Tab(text: 'Thu'),
            Tab(text: 'Fri'),
            Tab(text: 'Sat'),
            Tab(text: 'Sun'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildDaySchedule('Monday'),
          _buildDaySchedule('Tuesday'),
          _buildDaySchedule('Wednesday'),
          _buildDaySchedule('Thursday'),
          _buildDaySchedule('Friday'),
          _buildDaySchedule('Saturday'),
          _buildDaySchedule('Sunday'),
        ],
      ),
      bottomNavigationBar: const AppBottomNav(currentPath: '/schedule'),
    );
  }

  Widget _buildDaySchedule(String day) {
    // Sample schedule data - this would come from API
    final scheduleItems = _getSampleSchedule(day);

    if (scheduleItems.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.event_busy,
              size: 64,
              color: AppColors.textMuted,
            ),
            const SizedBox(height: AppDimensions.md),
            Text(
              'No classes on $day',
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
      itemCount: scheduleItems.length,
      itemBuilder: (context, index) {
        final item = scheduleItems[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: AppDimensions.md),
          child: _buildScheduleCard(item),
        );
      },
    );
  }

  Widget _buildScheduleCard(ScheduleItem item) {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppDimensions.cardPadding),
        child: Row(
          children: [
            // Time Column
            Container(
              width: 80,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.startTime,
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    item.endTime,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppDimensions.md),
            
            // Subject Column
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.subject,
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Text(
                    item.courseCode,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Row(
                    children: [
                      Icon(
                        Icons.location_on,
                        size: 14,
                        color: AppColors.textMuted,
                      ),
                      const SizedBox(width: AppDimensions.xs),
                      Text(
                        item.room,
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            
            // Status Indicator
            _buildStatusIndicator(item.status),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusIndicator(String status) {
    Color color;
    IconData icon;

    switch (status) {
      case 'ongoing':
        color = AppColors.success;
        icon = Icons.circle;
        break;
      case 'upcoming':
        color = AppColors.info;
        icon = Icons.circle_outlined;
        break;
      case 'completed':
        color = AppColors.textMuted;
        icon = Icons.check_circle;
        break;
      default:
        color = AppColors.textMuted;
        icon = Icons.circle;
    }

    return Icon(
      icon,
      color: color,
      size: 20,
    );
  }

  List<ScheduleItem> _getSampleSchedule(String day) {
    // Sample data - replace with API calls
    switch (day) {
      case 'Monday':
        return [
          ScheduleItem(
            startTime: '08:00 AM',
            endTime: '10:00 AM',
            subject: 'College Algebra',
            courseCode: 'MATH 101',
            room: 'Room 101',
            professor: 'Prof. Smith',
            status: 'completed',
          ),
          ScheduleItem(
            startTime: '10:30 AM',
            endTime: '12:30 PM',
            subject: 'English Communication',
            courseCode: 'ENG 101',
            room: 'Room 102',
            professor: 'Prof. Johnson',
            status: 'ongoing',
          ),
          ScheduleItem(
            startTime: '02:00 PM',
            endTime: '04:00 PM',
            subject: 'Introduction to Computer Science',
            courseCode: 'CS 101',
            room: 'Lab 1',
            professor: 'Prof. Davis',
            status: 'upcoming',
          ),
        ];
      case 'Tuesday':
        return [
          ScheduleItem(
            startTime: '09:00 AM',
            endTime: '11:00 AM',
            subject: 'Physics Fundamentals',
            courseCode: 'PHYS 101',
            room: 'Room 201',
            professor: 'Prof. Wilson',
            status: 'completed',
          ),
          ScheduleItem(
            startTime: '01:00 PM',
            endTime: '03:00 PM',
            subject: 'Calculus I',
            courseCode: 'MATH 201',
            room: 'Room 103',
            professor: 'Prof. Brown',
            status: 'upcoming',
          ),
        ];
      case 'Wednesday':
        return [
          ScheduleItem(
            startTime: '08:00 AM',
            endTime: '10:00 AM',
            subject: 'College Algebra',
            courseCode: 'MATH 101',
            room: 'Room 101',
            professor: 'Prof. Smith',
            status: 'completed',
          ),
          ScheduleItem(
            startTime: '10:30 AM',
            endTime: '12:30 PM',
            subject: 'English Communication',
            courseCode: 'ENG 101',
            room: 'Room 102',
            professor: 'Prof. Johnson',
            status: 'upcoming',
          ),
        ];
      case 'Thursday':
        return [
          ScheduleItem(
            startTime: '09:00 AM',
            endTime: '11:00 AM',
            subject: 'Physics Fundamentals',
            courseCode: 'PHYS 101',
            room: 'Room 201',
            professor: 'Prof. Wilson',
            status: 'upcoming',
          ),
          ScheduleItem(
            startTime: '02:00 PM',
            endTime: '04:00 PM',
            subject: 'Computer Programming',
            courseCode: 'CS 102',
            room: 'Lab 2',
            professor: 'Prof. Davis',
            status: 'upcoming',
          ),
        ];
      case 'Friday':
        return [
          ScheduleItem(
            startTime: '08:00 AM',
            endTime: '10:00 AM',
            subject: 'College Algebra',
            courseCode: 'MATH 101',
            room: 'Room 101',
            professor: 'Prof. Smith',
            status: 'upcoming',
          ),
          ScheduleItem(
            startTime: '01:00 PM',
            endTime: '03:00 PM',
            subject: 'Calculus I',
            courseCode: 'MATH 201',
            room: 'Room 103',
            professor: 'Prof. Brown',
            status: 'upcoming',
          ),
        ];
      case 'Saturday':
      case 'Sunday':
        return [];
      default:
        return [];
    }
  }
}

class ScheduleItem {
  final String startTime;
  final String endTime;
  final String subject;
  final String courseCode;
  final String room;
  final String professor;
  final String status;

  ScheduleItem({
    required this.startTime,
    required this.endTime,
    required this.subject,
    required this.courseCode,
    required this.room,
    required this.professor,
    required this.status,
  });
}