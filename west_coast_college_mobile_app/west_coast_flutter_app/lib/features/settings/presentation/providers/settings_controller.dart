import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../../core/network/api_client.dart';

class SettingsController extends StateNotifier<SettingsState> {
  final ApiClient? _apiClient;

  SettingsController([this._apiClient]) : super(const SettingsState()) {
    _loadSettings();
  }

  static const String _themeModeKey = 'theme_mode';
  static const String _googleEmailKey = 'google_email';

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final themeModeIndex = prefs.getInt(_themeModeKey) ?? 2; // Default to system
    final themeMode = ThemeMode.values[themeModeIndex];
    var googleEmail = prefs.getString(_googleEmailKey) ?? '';
    state = SettingsState(themeMode: themeMode, googleEmail: googleEmail);

    if (_apiClient != null) {
      try {
        Map<String, dynamic> data;
        try {
          final res = await _apiClient.get('/student/settings');
          data = res['data'] is Map<String, dynamic>
              ? res['data'] as Map<String, dynamic>
              : res;
        } catch (_) {
          final res = await _apiClient.get('/student/me');
          data = res['data'] is Map<String, dynamic>
              ? res['data'] as Map<String, dynamic>
              : res;
        }
        final serverEmail = (data['googleEmail'] ?? '').toString();
        if (serverEmail.isNotEmpty && serverEmail != googleEmail) {
          googleEmail = serverEmail;
          await prefs.setString(_googleEmailKey, serverEmail);
          state = state.copyWith(googleEmail: serverEmail);
        }
      } catch (_) {
        // Offline or unauthenticated; local value in state remains
      }
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_themeModeKey, mode.index);
    state = state.copyWith(themeMode: mode);
  }

  Future<bool> setGoogleEmail(String email) async {
    final trimmed = email.trim().toLowerCase();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_googleEmailKey, trimmed);
    state = state.copyWith(googleEmail: trimmed);

    if (_apiClient != null) {
      try {
        await _apiClient.put('/student/settings', data: {'googleEmail': trimmed});
        try {
          await _apiClient.put('/student/profile', data: {'email': trimmed});
        } catch (_) {}
        return true;
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  Future<bool> unlinkGoogleEmail() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_googleEmailKey);
    state = state.copyWith(googleEmail: '');

    if (_apiClient != null) {
      try {
        await _apiClient.put('/student/settings', data: {'unlinkGoogle': true});
        return true;
      } catch (_) {
        return false;
      }
    }
    return true;
  }
}

class SettingsState {
  final ThemeMode themeMode;
  final String googleEmail;

  const SettingsState({
    this.themeMode = ThemeMode.system,
    this.googleEmail = '',
  });

  SettingsState copyWith({
    ThemeMode? themeMode,
    String? googleEmail,
  }) {
    return SettingsState(
      themeMode: themeMode ?? this.themeMode,
      googleEmail: googleEmail ?? this.googleEmail,
    );
  }
}

final settingsControllerProvider = StateNotifierProvider<SettingsController, SettingsState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return SettingsController(apiClient);
});
