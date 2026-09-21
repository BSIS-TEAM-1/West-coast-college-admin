import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:west_coast_flutter_app/app.dart';
import 'package:west_coast_flutter_app/core/constants/storage_constants.dart';
import 'package:west_coast_flutter_app/core/network/api_client.dart';
import 'package:west_coast_flutter_app/core/storage/secure_storage_service.dart';

class _MemoryStorage extends SecureStorageService {
  _MemoryStorage() : super(const FlutterSecureStorage());

  final Map<String, String> _values = {};

  @override
  Future<void> saveSession({
    required String accessToken,
    required String refreshToken,
    required String studentId,
    required String studentNumber,
  }) async {
    _values[StorageConstants.accessToken] = accessToken;
    _values[StorageConstants.refreshToken] = refreshToken;
    _values[StorageConstants.studentId] = studentId;
    _values[StorageConstants.studentNumber] = studentNumber;
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
    'course': 101,
    'courseLabel': 'BEED',
    'yearLevel': 1,
    'section': 'BEED-1A',
  };

  @override
  Future<Map<String, dynamic>> post(String path, {dynamic data}) async {
    if (path.contains('login')) {
      return {
        'accessToken': 'token',
        'refreshToken': 'token',
        'student': _student,
      };
    }
    if (path.contains('logout')) return {};
    throw UnimplementedError('POST $path');
  }

  @override
  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? queryParameters}) async {
    if (path.contains('/student/me')) return {'data': _student};
    // Every other screen (dashboard, schedule, grades, ...) fails to load
    // on purpose: the bottom nav must still work regardless of content state.
    throw UnimplementedError('GET $path');
  }
}

Future<void> _pumpApp(WidgetTester tester) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        secureStorageProvider.overrideWithValue(_MemoryStorage()),
        apiClientProvider.overrideWith(
          (ref) => _FakeApi(ref.watch(secureStorageProvider)),
        ),
      ],
      child: const App(),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _login(WidgetTester tester) async {
  await tester.enterText(find.byType(TextFormField).at(0), '202410140200');
  await tester.enterText(find.byType(TextFormField).at(1), 'password123');
  await tester.tap(find.text('LOG IN'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('login lands on dashboard', (WidgetTester tester) async {
    await _pumpApp(tester);
    expect(find.text('LOG IN'), findsOneWidget);

    await _login(tester);

    // Dashboard scaffold (app bar title) is shown after login redirect.
    expect(find.text('WCConnect'), findsWidgets);
  });

  testWidgets('bottom nav reaches every destination after login', (WidgetTester tester) async {
    await _pumpApp(tester);
    await _login(tester);
    expect(find.text('WCConnect'), findsWidgets);

    // Regression test: the '/' parent route redirect used to bounce every
    // in-app navigation back to /dashboard, making the bottom nav appear
    // dead right after login. Each destination must actually render.
    final destinations = <IconData, String>{
      Icons.calendar_today_outlined: 'Schedule',
      Icons.school_outlined: 'Grades',
      Icons.notifications_outlined: 'Announcements',
      Icons.person_outlined: 'Profile',
    };
    for (final entry in destinations.entries) {
      await tester.tap(find.byIcon(entry.key));
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(AppBar, entry.value),
        findsOneWidget,
        reason: 'tapping nav destination should open ${entry.value}',
      );
    }

    // And back home.
    await tester.tap(find.byIcon(Icons.home_outlined));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'WCConnect'), findsOneWidget);
  });
}
