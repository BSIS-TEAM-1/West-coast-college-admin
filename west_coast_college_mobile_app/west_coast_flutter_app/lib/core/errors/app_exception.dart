/// Exception thrown by the network layer. Carries a user-safe [message]
/// plus technical details for logging, never for direct display.
class AppException implements Exception {
  final String message;
  final String errorCode;
  final int? statusCode;

  const AppException({
    required this.message,
    required this.errorCode,
    this.statusCode,
  });

  bool get isUnauthorized => statusCode == 401 || errorCode == 'AUTH_UNAUTHORIZED';
  bool get isNetworkError => errorCode == 'CONNECTION_ERROR' || errorCode == 'CONNECTION_TIMEOUT';

  @override
  String toString() => 'AppException($errorCode): $message';
}
