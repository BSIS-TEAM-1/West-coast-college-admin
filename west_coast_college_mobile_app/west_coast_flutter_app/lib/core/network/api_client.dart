import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/api_constants.dart';
import '../errors/app_exception.dart';
import '../storage/secure_storage_service.dart';

/// Centralized HTTP client for the new (Riverpod / clean-architecture)
/// features. Attaches the student bearer token to every request and clears
/// the stored session on a 401 so the router can redirect to Login.
class ApiClient {
  final Dio _dio;
  final SecureStorageService _storage;

  ApiClient(this._storage) : _dio = Dio(BaseOptions(
          baseUrl: ApiConstants.baseUrl,
          connectTimeout: const Duration(milliseconds: 15000),
          receiveTimeout: const Duration(milliseconds: 30000),
          headers: {
            ApiConstants.headerContentType: ApiConstants.contentTypeJson,
            ApiConstants.headerAccept: ApiConstants.contentTypeJson,
          },
        )) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.readAccessToken();
          if (token != null && token.isNotEmpty) {
            options.headers[ApiConstants.headerAuthorization] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == ApiConstants.statusUnauthorized) {
            await _storage.clearSession();
          }
          return handler.next(error);
        },
      ),
    );
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? queryParameters}) async {
    try {
      final response = await _dio.get(path, queryParameters: queryParameters);
      return _asMap(response.data);
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  Future<Map<String, dynamic>> post(String path, {dynamic data}) async {
    try {
      final response = await _dio.post(path, data: data);
      return _asMap(response.data);
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  Future<Map<String, dynamic>> put(String path, {dynamic data}) async {
    try {
      final response = await _dio.put(path, data: data);
      return _asMap(response.data);
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  /// Downloads a binary response (e.g. PDF). Returns the raw bytes.
  Future<List<int>> downloadBytes(String path) async {
    try {
      final response = await _dio.get(
        path,
        options: Options(responseType: ResponseType.bytes),
      );
      final data = response.data;
      if (data is List<int>) return data;
      if (data is Uint8List) return data;
      return <int>[];
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return <String, dynamic>{};
  }

  AppException _mapError(DioException error) {
    final response = error.response;
    final responseData = response?.data;

    String message;
    if (responseData is Map && responseData['error'] != null) {
      message = responseData['error'].toString();
    } else if (responseData is Map && responseData['message'] != null) {
      message = responseData['message'].toString();
    } else {
      message = _fallbackMessage(error);
    }

    return AppException(
      message: message,
      errorCode: _errorCode(error),
      statusCode: response?.statusCode,
    );
  }

  String _fallbackMessage(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return "This is taking longer than expected. Please try again.";
      case DioExceptionType.connectionError:
        return "We couldn't reach the server. Please check your internet connection.";
      case DioExceptionType.cancel:
        return 'Request was cancelled.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  String _errorCode(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'CONNECTION_TIMEOUT';
      case DioExceptionType.connectionError:
        return 'CONNECTION_ERROR';
      case DioExceptionType.cancel:
        return 'REQUEST_CANCELLED';
      case DioExceptionType.badResponse:
        return error.response?.statusCode == 401 ? 'AUTH_UNAUTHORIZED' : 'BAD_RESPONSE';
      default:
        return 'UNKNOWN_ERROR';
    }
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.watch(secureStorageProvider));
});
