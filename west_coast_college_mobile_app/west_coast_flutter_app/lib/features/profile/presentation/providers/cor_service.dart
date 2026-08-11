import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/api_client.dart';

/// Downloads the Certificate of Registration PDF from the backend's
/// /api/student/cor endpoint. The PDF is generated server-side by the same
/// StudentController.generateCorPdf the registrar uses — the mobile client
/// never fabricates a COR (spec §17).
class CorService {
  final ApiClient _client;
  CorService(this._client);

  Future<List<int>> downloadCorPdf() => _client.downloadBytes(ApiConstants.studentCor);
}

final corServiceProvider = Provider<CorService>((ref) {
  return CorService(ref.watch(apiClientProvider));
});
