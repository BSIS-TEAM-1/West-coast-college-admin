import 'app_exception.dart';

/// Domain-layer representation of "something went wrong". Keeps the
/// presentation layer free of Dio/HTTP-specific types and gives every
/// screen a consistent, student-friendly message to show.
sealed class Failure {
  final String message;
  const Failure(this.message);
}

class NetworkFailure extends Failure {
  const NetworkFailure([super.message = "We couldn't reach the server. Please check your internet connection."]);
}

class UnauthorizedFailure extends Failure {
  const UnauthorizedFailure([super.message = 'Your session has expired. Please log in again.']);
}

class NotFoundFailure extends Failure {
  const NotFoundFailure([super.message = "We couldn't find what you were looking for."]);
}

class ServerFailure extends Failure {
  const ServerFailure([super.message = 'Something went wrong on our end. Please try again later.']);
}

class ValidationFailure extends Failure {
  const ValidationFailure(super.message);
}

class UnknownFailure extends Failure {
  const UnknownFailure([super.message = 'Something unexpected happened. Please try again.']);
}

/// Maps a technical [AppException] to a UI-safe [Failure].
Failure mapExceptionToFailure(Object error) {
  if (error is AppException) {
    if (error.isNetworkError) return NetworkFailure(error.message);
    if (error.isUnauthorized) return const UnauthorizedFailure();
    if (error.statusCode == 404) return NotFoundFailure(error.message);
    if (error.statusCode == 400 || error.statusCode == 422) return ValidationFailure(error.message);
    if ((error.statusCode ?? 0) >= 500) return ServerFailure(error.message);
    return UnknownFailure(error.message);
  }
  return const UnknownFailure();
}
