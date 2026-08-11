import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/storage_constants.dart';

/// Thin wrapper around [FlutterSecureStorage] for everything session-related.
///
/// Uses the same [StorageConstants] keys as the legacy `AuthProvider` so
/// both the new Riverpod auth flow and any not-yet-migrated screens agree
/// on whether a student is logged in.
class SecureStorageService {
  final FlutterSecureStorage _storage;

  const SecureStorageService(this._storage);

  Future<void> saveSession({
    required String accessToken,
    required String refreshToken,
    required String studentId,
    required String studentNumber,
  }) async {
    await Future.wait([
      _storage.write(key: StorageConstants.accessToken, value: accessToken),
      _storage.write(key: StorageConstants.refreshToken, value: refreshToken),
      _storage.write(key: StorageConstants.studentId, value: studentId),
      _storage.write(key: StorageConstants.studentNumber, value: studentNumber),
    ]);
  }

  Future<String?> readAccessToken() => _storage.read(key: StorageConstants.accessToken);

  Future<String?> readRefreshToken() => _storage.read(key: StorageConstants.refreshToken);

  Future<bool> hasSession() async {
    final token = await readAccessToken();
    return token != null && token.isNotEmpty;
  }

  Future<void> clearSession() async {
    await Future.wait([
      _storage.delete(key: StorageConstants.accessToken),
      _storage.delete(key: StorageConstants.refreshToken),
      _storage.delete(key: StorageConstants.studentId),
      _storage.delete(key: StorageConstants.studentNumber),
      _storage.delete(key: StorageConstants.tokenExpiry),
    ]);
  }
}

final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return const SecureStorageService(FlutterSecureStorage());
});
