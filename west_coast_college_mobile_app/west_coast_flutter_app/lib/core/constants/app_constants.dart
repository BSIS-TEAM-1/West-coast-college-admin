class AppConstants {
  // App Information
  static const String appName = 'WCC Student Portal';
  static const String appTagline = 'Your Academic Journey, One Tap Away';
  static const String appVersion = '1.0.0';
  
  // API Configuration
  static const String apiBaseUrl = 'http://localhost:3001/api';
  static const int apiTimeout = 30000; // 30 seconds
  static const int apiConnectTimeout = 15000; // 15 seconds
  
  // Storage Keys
  static const String keyAccessToken = 'access_token';
  static const String keyRefreshToken = 'refresh_token';
  static const String keyStudentId = 'student_id';
  static const String keyStudentNumber = 'student_number';
  static const String keyBiometricEnabled = 'biometric_enabled';
  static const String keyTheme = 'app_theme';
  static const String keyLanguage = 'app_language';
  static const String keyOnboardingCompleted = 'onboarding_completed';
  
  // Pagination
  static const int defaultPageSize = 20;
  static const int maxPageSize = 100;
  
  // Cache Duration
  static const int cacheDurationMinutes = 30;
  
  // Rate Limiting
  static const int maxRetryAttempts = 3;
  static const int retryDelayMs = 1000;
  
  // Course Codes
  static const Map<int, String> courseCodes = {
    101: 'BEED',
    102: 'BSED-English',
    103: 'BSED-Math',
    201: 'BSBA-HRM',
  };
  
  static const Map<int, String> courseNames = {
    101: 'Bachelor of Elementary Education',
    102: 'Bachelor of Secondary Education - English',
    103: 'Bachelor of Secondary Education - Mathematics',
    201: 'Bachelor of Science in Business Administration - HRM',
  };
  
  // Student Status
  static const List<String> studentStatuses = [
    'Regular',
    'Irregular',
    'Dropped',
    'Returnee',
    'Transferee',
  ];
  
  // Lifecycle Status
  static const List<String> lifecycleStatuses = [
    'Pending',
    'Enrolled',
    'Not Enrolled',
    'Dropped',
    'Inactive',
    'Graduated',
  ];
  
  // Semesters
  static const List<String> semesters = ['1st', '2nd', 'Summer'];
  
  // Announcement Types
  static const List<String> announcementTypes = [
    'info',
    'warning',
    'urgent',
    'maintenance',
  ];
  
  // Document Types
  static const List<String> documentTypes = [
    'COR',
    'Transcript',
    'Certificate',
    'Diploma',
    'GoodMoral',
    'Other',
  ];
  
  // Document Status
  static const List<String> documentStatuses = [
    'available',
    'pending',
    'processing',
    'rejected',
    'expired',
  ];
  
  // Validation
  static const int minPasswordLength = 8;
  static const int maxPasswordLength = 128;
  static const int minStudentNumberLength = 10;
  static const int maxStudentNumberLength = 15;
  
  // UI Constants
  static const double defaultBorderRadius = 8.0;
  static const double cardBorderRadius = 12.0;
  static const double buttonHeight = 48.0;
  static const double inputHeight = 56.0;
  
  // Animation Durations
  static const int animationDurationFast = 150;
  static const int animationDurationMedium = 300;
  static const int animationDurationSlow = 500;
  
  // File Size Limits
  static const int maxFileSizeMB = 10;
  static const int maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
  
  // Supported Image Formats
  static const List<String> supportedImageFormats = [
    'jpg',
    'jpeg',
    'png',
    'gif',
  ];
  
  // Supported Document Formats
  static const List<String> supportedDocumentFormats = [
    'pdf',
    'doc',
    'docx',
  ];
}