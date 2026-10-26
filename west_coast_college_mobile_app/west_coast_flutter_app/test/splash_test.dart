import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:west_coast_flutter_app/app.dart';
import 'package:west_coast_flutter_app/core/constants/storage_constants.dart';
import 'package:west_coast_flutter_app/core/network/api_client.dart';
import 'package:west_coast_flutter_app/core/storage/secure_storage_service.dart';
import 'package:west_coast_flutter_app/features/auth/presentation/pages/app_splash_page.dart';

class _MemoryStorage extends SecureStorageService {
  _MemoryStorage() : super(const FlutterSecureStorage());

  final Map<String, String> _values = {};

  void seed({
    required String accessToken,
    required String refreshToken,
    required String studentId,
    required String studentNumber,
  }) {
    _values[StorageConstants.accessToken] = accessToken;
    _values[StorageConstants.refreshToken] = refreshToken;
    _values[StorageConstants.studentId] = studentId;
    _values[StorageConstants.studentNumber] = studentNumber;
  }

  @override
  Future<void> saveSession({
    required String accessToken,
    required String refreshToken,
    required String studentId,
    required String studentNumber,
  }) async {
    seed(
      accessToken: accessToken,
      refreshToken: refreshToken,
      studentId: studentId,
      studentNumber: studentNumber,
    );
  }

  @override
  Future<String?> readAccessToken() async => _values[StorageConstants.accessToken];

  @override
  Future<String?> readRefreshToken() async => _values[StorageConstants.refreshToken];

  @override
  Future<bool> hasSession() async => (_values[StorageConstants.accessToken] ?? '').isNotEmpty;

  @override
  Future<void> clearSession() async => _values.clear();
}

class _FakeApi extends ApiClient {
  _FakeApi(super.storage);

  static const _student = {
    'id': 'student-1',
    '_id': 'student-1',
    'studentNumber': '202410140200',
    'firstName': 'Test',
    'lastName': 'Student',
    'fullName': 'Test Student',
  };

  @override
  Future<Map<String, dynamic>> post(String path, {dynamic data}) async {
    if (path.contains('logout')) return {};
    throw UnimplementedError('POST $path');
  }

  @override
  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? queryParameters}) async {
    if (path.contains('/student/me')) return {'data': _student};
    throw UnimplementedError('GET $path');
  }
}

/// Branded splash content, mounted directly (no router) so the animation and
/// metadata can be asserted deterministically. The repeating ambient loop is
/// left running, so we never call `pumpAndSettle` here — the real app replaces
/// this page via the router the moment initialization settles.
Widget _splashScope(Widget child) => ProviderScope(
      overrides: [
        secureStorageProvider.overrideWithValue(_MemoryStorage()),
        apiClientProvider.overrideWith(
          (ref) => _FakeApi(ref.watch(secureStorageProvider)),
        ),
      ],
      child: child,
    );

Future<void> _pump(WidgetTester tester, _MemoryStorage storage) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        secureStorageProvider.overrideWithValue(storage),
        apiClientProvider.overrideWith(
          (ref) => _FakeApi(ref.watch(secureStorageProvider)),
        ),
      ],
      child: const App(),
    ),
  );
}

void main() {
  testWidgets('splash renders the WccPortal branding with a gold loader', (WidgetTester tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      _splashScope(const MaterialApp(home: AppSplashPage())),
    );
    await tester.pump(const Duration(milliseconds: 320));

    // The complete logo asset (emblem + its baked-in WccPortal wordmark) is
    // rendered un-clipped via BoxFit.contain — the app name itself is the
    // wordmark inside the logo, so no separate duplicate text is rendered.
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is Image &&
            widget.image == const AssetImage('assets/images/Wcc-Icon.png'),
      ),
      findsOneWidget,
    );
    expect(find.text('WEST COAST COLLEGE'), findsOneWidget);
    expect(find.text('Your Academic Journey, One Tap Away'), findsOneWidget);
    // The loader is only labelled while restoring the session.
    expect(
      find.bySemanticsLabel('Restoring your session'),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testWidgets('redirects to login when no session exists', (WidgetTester tester) async {
    await _pump(tester, _MemoryStorage());

    await tester.pumpAndSettle();
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.byType(AppSplashPage), findsNothing);
  });

  testWidgets('redirects to dashboard when a stored session restores', (WidgetTester tester) async {
    final storage = _MemoryStorage();
    storage.seed(
      accessToken: 'token',
      refreshToken: 'token',
      studentId: 'student-1',
      studentNumber: '202410140200',
    );
    await _pump(tester, storage);

    await tester.pumpAndSettle();
    expect(find.byType(AppSplashPage), findsNothing);
    // Dashboard app bar with the new brand name is the landing surface.
    expect(find.widgetWithText(AppBar, 'WccPortal'), findsOneWidget);
  });
}
