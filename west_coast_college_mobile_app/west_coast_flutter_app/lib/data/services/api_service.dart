import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/constants/api_constants.dart';
import '../../core/constants/storage_constants.dart';

class ApiService {
  late Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl: ApiConstants.baseUrl,
      connectTimeout: const Duration(milliseconds: 15000),
      receiveTimeout: const Duration(milliseconds: 30000),
      headers: {
        ApiConstants.headerContentType: ApiConstants.contentTypeJson,
        ApiConstants.headerAccept: ApiConstants.contentTypeJson,
      },
    ));

    _setupInterceptors();
  }

  void _setupInterceptors() {
    // Request interceptor for adding auth token
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: StorageConstants.accessToken);
        if (token != null) {
          options.headers[ApiConstants.headerAuthorization] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onResponse: (response, handler) {
        return handler.next(response);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == ApiConstants.statusUnauthorized) {
          // Try to refresh token
          final refreshed = await _refreshToken();
          if (refreshed) {
            // Retry the original request
            final token = await _storage.read(key: StorageConstants.accessToken);
            final options = error.requestOptions;
            options.headers[ApiConstants.headerAuthorization] = 'Bearer $token';
            
            final response = await _dio.fetch(options);
            return handler.resolve(response);
          }
        }
        return handler.next(error);
      },
    ));
  }

  Future<bool> _refreshToken() async {
    try {
      final refreshToken = await _storage.read(key: StorageConstants.refreshToken);
      if (refreshToken == null) return false;

      final response = await _dio.post(
        ApiConstants.refreshToken,
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == ApiConstants.statusOk) {
        final accessToken = response.data['data']['accessToken'];
        await _storage.write(key: StorageConstants.accessToken, value: accessToken);
        return true;
      }
    } catch (e) {
      // Refresh failed, clear tokens
      await _clearTokens();
    }
    return false;
  }

  Future<void> _clearTokens() async {
    await _storage.delete(key: StorageConstants.accessToken);
    await _storage.delete(key: StorageConstants.refreshToken);
    await _storage.delete(key: StorageConstants.tokenExpiry);
  }

  // GET request
  Future<Response> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.get(
        path,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // POST request
  Future<Response> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.post(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // PUT request
  Future<Response> put(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.put(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // DELETE request
  Future<Response> delete(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.delete(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Exception _handleError(DioException error) {
    String message;
    String errorCode = 'UNKNOWN_ERROR';

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
        message = 'Connection timeout. Please check your internet connection.';
        errorCode = 'CONNECTION_TIMEOUT';
        break;
      case DioExceptionType.sendTimeout:
        message = 'Send timeout. Please try again.';
        errorCode = 'SEND_TIMEOUT';
        break;
      case DioExceptionType.receiveTimeout:
        message = 'Receive timeout. Please try again.';
        errorCode = 'RECEIVE_TIMEOUT';
        break;
      case DioExceptionType.badResponse:
        final statusCode = error.response?.statusCode;
        final responseData = error.response?.data;

        if (responseData != null && responseData is Map) {
          message = responseData['message'] ?? 'An error occurred';
          errorCode = responseData['errorCode'] ?? _getErrorCodeFromStatus(statusCode);
        } else {
          message = _getMessageFromStatus(statusCode);
          errorCode = _getErrorCodeFromStatus(statusCode);
        }
        break;
      case DioExceptionType.cancel:
        message = 'Request was cancelled.';
        errorCode = 'REQUEST_CANCELLED';
        break;
      case DioExceptionType.badCertificate:
        message = 'Invalid SSL certificate. Please contact support.';
        errorCode = 'BAD_CERTIFICATE';
        break;
      case DioExceptionType.connectionError:
        message = 'Connection error. Please check your internet connection.';
        errorCode = 'CONNECTION_ERROR';
        break;
      case DioExceptionType.transformTimeout:
        message = 'Transform timeout. Please try again.';
        errorCode = 'TRANSFORM_TIMEOUT';
        break;
      case DioExceptionType.unknown:
        if (error.error is Exception) {
          return error.error as Exception;
        }
        message = 'An unexpected error occurred. Please try again.';
        errorCode = 'UNKNOWN_ERROR';
        break;
    }

    return ApiException(message: message, errorCode: errorCode);
  }

  String _getMessageFromStatus(int? statusCode) {
    switch (statusCode) {
      case ApiConstants.statusBadRequest:
        return 'Invalid request. Please check your input.';
      case ApiConstants.statusUnauthorized:
        return 'Unauthorized. Please login again.';
      case ApiConstants.statusForbidden:
        return 'Access denied. You don\'t have permission.';
      case ApiConstants.statusNotFound:
        return 'Resource not found.';
      case ApiConstants.statusConflict:
        return 'Conflict with existing data.';
      case ApiConstants.statusTooManyRequests:
        return 'Too many requests. Please try again later.';
      case ApiConstants.statusInternalServerError:
        return 'Server error. Please try again later.';
      case ApiConstants.statusServiceUnavailable:
        return 'Service unavailable. Please try again later.';
      default:
        return 'An error occurred. Please try again.';
    }
  }

  String _getErrorCodeFromStatus(int? statusCode) {
    switch (statusCode) {
      case ApiConstants.statusBadRequest:
        return ApiConstants.errorValidation;
      case ApiConstants.statusUnauthorized:
        return ApiConstants.errorUnauthorized;
      case ApiConstants.statusForbidden:
        return ApiConstants.errorUnauthorized;
      case ApiConstants.statusNotFound:
        return ApiConstants.errorStudentNotFound;
      case ApiConstants.statusTooManyRequests:
        return ApiConstants.errorRateLimit;
      case ApiConstants.statusInternalServerError:
        return ApiConstants.errorServer;
      case ApiConstants.statusServiceUnavailable:
        return ApiConstants.errorServer;
      default:
        return 'UNKNOWN_ERROR';
    }
  }

  // Method to update base URL (useful for testing)
  void updateBaseUrl(String newBaseUrl) {
    _dio.options.baseUrl = newBaseUrl;
  }

  // Get Dio instance for custom requests
  Dio get dio => _dio;
}

class ApiException implements Exception {
  final String message;
  final String errorCode;

  ApiException({required this.message, required this.errorCode});

  @override
  String toString() => message;
}