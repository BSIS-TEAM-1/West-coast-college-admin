import 'student.dart';

class AuthResponse {
  final String accessToken;
  final String refreshToken;
  final Student student;

  AuthResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.student,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      accessToken: json['accessToken'] ?? '',
      refreshToken: json['refreshToken'] ?? '',
      student: json['student'] != null 
          ? Student.fromJson(json['student']) 
          : Student.empty(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'student': student.toJson(),
    };
  }
}

class LoginRequest {
  final String studentNumber;
  final String password;

  LoginRequest({
    required this.studentNumber,
    required this.password,
  });

  Map<String, dynamic> toJson() {
    return {
      'studentNumber': studentNumber,
      'password': password,
    };
  }
}

class RefreshTokenRequest {
  final String refreshToken;

  RefreshTokenRequest({
    required this.refreshToken,
  });

  Map<String, dynamic> toJson() {
    return {
      'refreshToken': refreshToken,
    };
  }
}

class ApiResponse<T> {
  final bool success;
  final String? message;
  final T? data;

  ApiResponse({
    required this.success,
    this.message,
    this.data,
  });

  factory ApiResponse.fromJson(Map<String, dynamic> json) {
    return ApiResponse(
      success: json['success'] ?? false,
      message: json['message'],
      data: json['data'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'success': success,
      'message': message,
      'data': data,
    };
  }
}