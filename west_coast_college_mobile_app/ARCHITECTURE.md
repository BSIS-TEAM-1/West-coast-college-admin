# West Coast College Student Portal - Flutter Architecture

## Technology Stack Decisions

### State Management: **Provider**
- **Rationale**: Simple, well-documented, built into Flutter SDK, sufficient for this app's complexity
- **Benefits**: Easy learning curve, good community support, minimal boilerplate
- **Usage**: 
  - `ChangeNotifier` for state management
  - `Consumer` and `Provider.of` for state consumption
  - `MultiProvider` for dependency injection

### Navigation: **Go Router**
- **Rationale**: Declarative routing, deep linking support, web-compatible, modern approach
- **Benefits**: Type-safe routes, easy back button handling, URL-based navigation
- **Usage**:
  - `GoRouter` for route configuration
  - `GoRoute` for individual route definitions
  - Shell routes for bottom navigation

### API Layer: **Dio**
- **Rationale**: Feature-rich, interceptors support, good error handling, file upload/download
- **Benefits**: Built-in timeout handling, request/response interceptors, cancellation support
- **Usage**:
  - `Dio` instance for HTTP client
  - Interceptors for auth tokens and error handling
  - Automatic token refresh

### Local Storage: **Flutter Secure Storage**
- **Rationale**: Secure storage for sensitive data (auth tokens, passwords)
- **Benefits**: Platform-specific secure storage (Keychain on iOS, Keystore on Android)
- **Usage**: Store JWT tokens, refresh tokens, biometric preferences

### Push Notifications: **Firebase Cloud Messaging**
- **Rationale**: Cross-platform support, free, reliable, good documentation
- **Benefits**: Push notifications to both iOS and Android, message targeting
- **Usage**: `firebase_messaging` package for push notification handling

## Project Structure

```
lib/
├── main.dart                    # App entry point
├── app.dart                     # Root widget with providers
│
├── core/                        # Core functionality
│   ├── constants/
│   │   ├── app_constants.dart   # App-wide constants
│   │   ├── api_constants.dart   # API endpoints and configs
│   │   └── storage_constants.dart # Storage keys
│   ├── theme/
│   │   ├── app_theme.dart       # Theme configuration
│   │   ├── app_colors.dart      # Color palette
│   │   ├── app_text_styles.dart # Typography
│   │   └── app_dimensions.dart  # Spacing and sizes
│   ├── utils/
│   │   ├── validators.dart      # Input validation
│   │   ├── formatters.dart      # Data formatting
│   │   └── helpers.dart         # Utility functions
│   └── config/
│       ├── env_config.dart      # Environment configuration
│       └── router_config.dart   # Router configuration
│
├── data/                        # Data layer
│   ├── models/
│   │   ├── student.dart         # Student data model
│   │   ├── schedule.dart        # Schedule data model
│   │   ├── grade.dart           # Grade data model
│   │   ├── announcement.dart    # Announcement data model
│   │   ├── document.dart        # Document data model
│   │   └── auth_response.dart   # Authentication response model
│   ├── repositories/
│   │   ├── auth_repository.dart # Authentication repository
│   │   ├── student_repository.dart # Student data repository
│   │   ├── schedule_repository.dart # Schedule repository
│   │   ├── grade_repository.dart  # Grade repository
│   │   ├── announcement_repository.dart # Announcement repository
│   │   └── document_repository.dart # Document repository
│   └── services/
│       ├── api_service.dart     # Base API service
│       ├── auth_service.dart    # Authentication service
│       ├── storage_service.dart  # Local storage service
│       └── notification_service.dart # Push notification service
│
├── features/                    # Feature modules
│   ├── auth/
│   │   ├── login/
│   │   │   ├── login_page.dart
│   │   │   ├── login_controller.dart
│   │   │   └── login_view.dart
│   │   ├── splash/
│   │   │   ├── splash_page.dart
│   │   │   └── splash_controller.dart
│   │   └── auth_provider.dart    # Auth state management
│   ├── dashboard/
│   │   ├── dashboard_page.dart
│   │   ├── dashboard_controller.dart
│   │   ├── dashboard_view.dart
│   │   └── widgets/
│   │       ├── status_card.dart
│   │       ├── schedule_preview.dart
│   │       └── announcement_card.dart
│   ├── schedule/
│   │   ├── schedule_page.dart
│   │   ├── schedule_controller.dart
│   │   ├── schedule_view.dart
│   │   └── widgets/
│   │       ├── weekly_calendar.dart
│   │       ├── daily_timeline.dart
│   │       └── class_detail_card.dart
│   ├── grades/
│   │   ├── grades_page.dart
│   │   ├── grades_controller.dart
│   │   ├── grades_view.dart
│   │   └── widgets/
│   │       ├── semester_selector.dart
│   │       ├── grade_card.dart
│   │       └── grade_detail_dialog.dart
│   ├── announcements/
│   │   ├── announcements_page.dart
│   │   ├── announcements_controller.dart
│   │   ├── announcements_view.dart
│   │   └── widgets/
│   │       ├── announcement_list.dart
│   │       ├── announcement_detail.dart
│   │       └── announcement_filter.dart
│   ├── documents/
│   │   ├── documents_page.dart
│   │   ├── documents_controller.dart
│   │   ├── documents_view.dart
│   │   └── widgets/
│   │       ├── document_list.dart
│   │       ├── document_card.dart
│   │       └── pdf_viewer.dart
│   ├── profile/
│   │   ├── profile_page.dart
│   │   ├── profile_controller.dart
│   │   ├── profile_view.dart
│   │   └── widgets/
│   │       ├── personal_info_section.dart
│   │       ├── contact_info_section.dart
│   │       └── academic_summary_section.dart
│   └── support/
│       ├── support_page.dart
│       ├── support_controller.dart
│       ├── support_view.dart
│       └── widgets/
│           ├── contact_section.dart
│           ├── faq_section.dart
│           └── issue_report_form.dart
│
└── shared/                      # Shared components
    ├── widgets/
    │   ├── app_bottom_nav.dart  # Bottom navigation bar
    │   ├── app_scaffold.dart    # Custom scaffold
    │   ├── loading_indicator.dart
    │   ├── error_widget.dart
    │   ├── empty_state_widget.dart
    │   └── custom_button.dart
    └── components/
        ├── app_bar.dart
        ├── card.dart
        └── text_field.dart
```

## Data Models

### Student Model
```dart
class Student {
  final String id;
  final String studentNumber;
  final String firstName;
  final String? middleName;
  final String lastName;
  final String? suffix;
  final int course; // 101, 102, 103, 201
  final String? major;
  final int yearLevel;
  final String? section;
  final String scholarship;
  final String semester;
  final String schoolYear;
  final String studentStatus;
  final String lifecycleStatus;
  final String enrollmentStatus;
  final String? email;
  final String contactNumber;
  final String address;
  final String? permanentAddress;
  final DateTime? birthDate;
  final String? birthPlace;
  final String? gender;
  final String? civilStatus;
  final String nationality;
  final String? religion;
  final EmergencyContact? emergencyContact;
  final String? assignedProfessor;
  final String? schedule;
  final double? latestGrade;
  final String? gradeProfessor;
  final DateTime? gradeDate;
  final bool isActive;
  final DateTime? lastLogin;
}
```

### Schedule Model
```dart
class ClassSchedule {
  final String id;
  final String subjectCode;
  final String subjectName;
  final String professorName;
  final String room;
  final String dayOfWeek;
  final String startTime;
  final String endTime;
  final String section;
  final int course;
  final int yearLevel;
}
```

### Grade Model
```dart
class Grade {
  final String id;
  final String subjectCode;
  final String subjectName;
  final double grade;
  final String semester;
  final String schoolYear;
  final String? professor;
  final DateTime? gradeDate;
  final int units;
}
```

### Announcement Model
```dart
class Announcement {
  final String id;
  final String title;
  final String message;
  final String type; // info, warning, urgent, maintenance
  final DateTime createdAt;
  final DateTime? expiresAt;
  final bool isActive;
  final bool isPinned;
  final List<String>? tags;
  final String? createdBy;
}
```

### Document Model
```dart
class Document {
  final String id;
  final String documentType;
  final String title;
  final String description;
  final String fileUrl;
  final DateTime? issuedDate;
  final String status; // available, pending, unavailable
}
```

## Theme System

### Color Palette (WCC College Branding)
```dart
class AppColors {
  // Primary Colors
  static const Color primary = Color(0xFF1E3A8A); // Deep Blue
  static const Color primaryLight = Color(0xFF3B82F6); // Light Blue
  static const Color primaryDark = Color(0xFF1E40AF); // Darker Blue
  
  // Secondary Colors
  static const Color secondary = Color(0xFF10B981); // Green
  static const Color accent = Color(0xFFF59E0B); // Amber
  
  // Neutral Colors
  static const Color background = Color(0xFFF9FAFB);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color error = Color(0xFFEF4444);
  static const Color warning = Color(0xFFF59E0B);
  static const Color success = Color(0xFF10B981);
  
  // Text Colors
  static const Color textPrimary = Color(0xFF111827);
  static const Color textSecondary = Color(0xFF6B7280);
  static const Color textDisabled = Color(0xFF9CA3AF);
}
```

### Typography
```dart
class AppTextStyles {
  static const TextStyle heading1 = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.bold,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle heading2 = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.bold,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle heading3 = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle bodyLarge = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.normal,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.normal,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle bodySmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.normal,
    color: AppColors.textSecondary,
  );
}
```

## Component Library Specifications

### Custom Button
- Variants: Primary, Secondary, Outline, Text
- States: Normal, Pressed, Disabled, Loading
- Sizes: Small, Medium, Large

### Custom Card
- Types: Elevated, Outlined, Flat
- Shadows: Subtle, Medium, Heavy
- Border radius: 8px, 12px, 16px

### Custom TextField
- Types: Standard, Outlined, Underline
- Validation: Real-time, on blur, on submit
- States: Normal, Error, Success, Disabled

### Loading States
- Full-screen loader
- Button loader
- Skeleton loaders
- Pull-to-refresh

### Error Handling
- Network error screen
- Error dialog
- Inline error messages
- Retry mechanisms

## Security Considerations

### Authentication
- JWT token storage in secure storage
- Automatic token refresh
- Session timeout handling
- Biometric authentication option

### Data Security
- HTTPS only for API calls
- Certificate pinning (optional)
- Sensitive data encryption at rest
- Secure logging (no sensitive data)

### API Security
- Request rate limiting
- Input validation
- SQL injection prevention
- XSS prevention

## Performance Optimization

### Data Caching
- API response caching
- Image caching
- Local data persistence where appropriate

### Memory Management
- Proper widget disposal
- Image optimization
- List virtualization for long lists

### Network Optimization
- Request batching
- Compression
- Lazy loading
- Offline queue (for future)

## Accessibility

### Screen Reader Support
- Semantic labels
- Proper focus management
- Announcements for state changes

### Visual Accessibility
- Sufficient color contrast (WCAG AA)
- Scalable text sizes
- Touch target sizes (min 44x44)
- Colorblind-friendly palette

### Motor Accessibility
- Keyboard navigation
- Voice control support
- Gesture alternatives