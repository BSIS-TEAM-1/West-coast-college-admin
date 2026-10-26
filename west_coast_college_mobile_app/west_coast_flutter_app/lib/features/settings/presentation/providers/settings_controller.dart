import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsController extends StateNotifier<SettingsState> {
  SettingsController() : super(const SettingsState()) {
    _loadSettings();
  }

  static const String _themeModeKey = 'theme_mode';
  static const String _googleEmailKey = 'google_email';

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final themeModeIndex = prefs.getInt(_themeModeKey) ?? 2; // Default to system
    final themeMode = ThemeMode.values[themeModeIndex];
    final googleEmail = prefs.getString(_googleEmailKey) ?? '';
    state = SettingsState(themeMode: themeMode, googleEmail: googleEmail);
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_themeModeKey, mode.index);
    state = SettingsState(themeMode: mode);
  }

  Future<void> setGoogleEmail(String email) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_googleEmailKey, email);
    state = SettingsState(themeMode: state.themeMode, googleEmail: email);
  }
}

class SettingsState {
  final ThemeMode themeMode;
  final String googleEmail;

  const SettingsState({this.themeMode = ThemeMode.system, this.googleEmail = ''});
}

final settingsControllerProvider = StateNotifierProvider<SettingsController, SettingsState>((ref) {
  return SettingsController();
});
