class ApiConstants {
  // Base URL
  static const String baseUrl = 'http://localhost:3001/api';
  
  // Endpoints - Authentication
  static const String login = '/student/login';
  static const String logout = '/student/logout';
  static const String refreshToken = '/student/refresh-token';
  
  // Endpoints - Student Data
  static const String studentMe = '/student/me';
  static const String studentSchedule = '/student/schedule';
  static const String studentGrades = '/student/grades';
  static const String studentDocuments = '/student/documents';
  static const String studentAnnouncements = '/student/announcements';
  
  // Endpoints - Notifications
  static const String registerNotification = '/student/notifications/register';
  static const String unregisterNotification = '/student/notifications/unregister';
  
  // Query Parameters
  static const String paramSemester = 'semester';
  static const String paramSchoolYear = 'schoolYear';
  static const String paramLimit = 'limit';
  static const String paramOffset = 'offset';
  static const String paramType = 'type';
  
  // Default Values
  static const int defaultLimit = 20;
  static const int defaultOffset = 0;
  
  // Headers
  static const String headerContentType = 'Content-Type';
  static const String headerAuthorization = 'Authorization';
  static const String headerAccept = 'Accept';
  
  // Content Types
  static const String contentTypeJson = 'application/json';
  static const String contentTypeFormData = 'multipart/form-data';
  
  // Response Keys
  static const String keySuccess = 'success';
  static const String keyMessage = 'message';
  static const String keyData = 'data';
  static const String keyError = 'error';
  static const String keyErrorCode = 'errorCode';
  
  // Error Codes
  static const String errorInvalidCredentials = 'AUTH_INVALID_CREDENTIALS';
  static const String errorTokenExpired = 'AUTH_TOKEN_EXPIRED';
  static const String errorTokenInvalid = 'AUTH_TOKEN_INVALID';
  static const String errorUnauthorized = 'AUTH_UNAUTHORIZED';
  static const String errorStudentNotFound = 'STUDENT_NOT_FOUND';
  static const String errorStudentNotEnrolled = 'STUDENT_NOT_ENROLLED';
  static const String errorValidation = 'VALIDATION_ERROR';
  static const String errorServer = 'SERVER_ERROR';
  static const String errorRateLimit = 'RATE_LIMIT_EXCEEDED';
  
  // HTTP Status Codes
  static const int statusOk = 200;
  static const int statusCreated = 201;
  static const int statusBadRequest = 400;
  static const int statusUnauthorized = 401;
  static const int statusForbidden = 403;
  static const int statusNotFound = 404;
  static const int statusConflict = 409;
  static const int statusTooManyRequests = 429;
  static const int statusInternalServerError = 500;
  static const int statusServiceUnavailable = 503;
}