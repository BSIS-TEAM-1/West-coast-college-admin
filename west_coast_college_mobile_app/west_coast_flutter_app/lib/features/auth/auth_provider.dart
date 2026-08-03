import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../data/models/auth_response.dart';
import '../../../data/models/student.dart';
import '../../../data/services/api_service.dart';
import '../../../core/constants/storage_constants.dart';
import '../../../core/constants/api_constants.dart';

enum AuthStatus {
  initial,
  loading,
  authenticated,
  unauthenticated,
  error,
}

class AuthProvider with ChangeNotifier {
  final ApiService _apiService;
  final FlutterSecureStorage _storage;

  AuthProvider({
    required ApiService apiService,
    FlutterSecureStorage? storage,
  })  : _apiService = apiService,
        _storage = storage ?? const FlutterSecureStorage();

  AuthStatus _status = AuthStatus.initial;
  Student? _student;
  String? _errorMessage;
  bool _isLoading = false;

  // Getters
  AuthStatus get status => _status;
  Student? get student => _student;
  String? get errorMessage => _errorMessage;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _status == AuthStatus.authenticated;

  // Initialize - check if user is already logged in
  Future<void> initialize() async {
    _status = AuthStatus.loading;
    _isLoading = true;
    notifyListeners();

    try {
      final token = await _storage.read(key: StorageConstants.accessToken);
      final studentId = await _storage.read(key: StorageConstants.studentId);

      if (token != null && studentId != null) {
        // Try to fetch student data to validate token
        try {
          final response = await _apiService.get(ApiConstants.studentMe);
          if (response.statusCode == ApiConstants.statusOk) {
            _student = Student.fromJson(response.data['data']);
            _status = AuthStatus.authenticated;
          } else {
            // Token invalid, clear it
            await logout();
          }
        } catch (e) {
          // Token validation failed, clear it
          await logout();
        }
      } else {
        _status = AuthStatus.unauthenticated;
      }
    } catch (e) {
      _errorMessage = 'Failed to initialize authentication';
      _status = AuthStatus.error;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Login
  Future<bool> login(String studentNumber, String password) async {
    _status = AuthStatus.loading;
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _apiService.post(
        ApiConstants.login,
        data: {
          'studentNumber': studentNumber,
          'password': password,
        },
      );

      if (response.statusCode == ApiConstants.statusOk) {
        final authResponse = AuthResponse.fromJson(response.data['data']);
        
        // Store tokens
        await _storage.write(
          key: StorageConstants.accessToken,
          value: authResponse.accessToken,
        );
        await _storage.write(
          key: StorageConstants.refreshToken,
          value: authResponse.refreshToken,
        );
        await _storage.write(
          key: StorageConstants.studentId,
          value: authResponse.student.id,
        );
        await _storage.write(
          key: StorageConstants.studentNumber,
          value: authResponse.student.studentNumber,
        );

        _student = authResponse.student;
        _status = AuthStatus.authenticated;
        _isLoading = false;
        notifyListeners();
        return true;
      } else {
        _errorMessage = response.data['message'] ?? 'Login failed';
        _status = AuthStatus.unauthenticated;
        _isLoading = false;
        notifyListeners();
        return false;
      }
    } catch (e) {
      _errorMessage = e is ApiException ? e.message : 'Login failed. Please try again.';
      _status = AuthStatus.unauthenticated;
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  // Logout
  Future<void> logout() async {
    _status = AuthStatus.loading;
    _isLoading = true;
    notifyListeners();

    try {
      // Call logout endpoint if we have a token
      final token = await _storage.read(key: StorageConstants.accessToken);
      if (token != null) {
        try {
          await _apiService.post(ApiConstants.logout);
        } catch (e) {
          // Ignore logout errors, just clear local storage
        }
      }

      // Clear storage
      await _storage.delete(key: StorageConstants.accessToken);
      await _storage.delete(key: StorageConstants.refreshToken);
      await _storage.delete(key: StorageConstants.studentId);
      await _storage.delete(key: StorageConstants.studentNumber);
      await _storage.delete(key: StorageConstants.tokenExpiry);

      _student = null;
      _status = AuthStatus.unauthenticated;
      _errorMessage = null;
    } catch (e) {
      _errorMessage = 'Logout failed';
      _status = AuthStatus.error;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Refresh student data
  Future<void> refreshStudentData() async {
    if (!isAuthenticated) return;

    try {
      final response = await _apiService.get(ApiConstants.studentMe);
      if (response.statusCode == ApiConstants.statusOk) {
        _student = Student.fromJson(response.data['data']);
        notifyListeners();
      }
    } catch (e) {
      // If refresh fails, user might need to re-login
      if (e is ApiException && e.errorCode == ApiConstants.errorUnauthorized) {
        await logout();
      }
    }
  }

  // Clear error
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}