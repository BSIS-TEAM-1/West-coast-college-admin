/// Formats a numeric grade using WCC's configurable decimal grading scale.
///
/// Grades follow the decimal format (1.0, 1.1, 1.2 … 5.0), so values that sit
/// on the tenths grid render with one decimal place. Historical quarter-point
/// records (e.g. 1.25) keep two decimals so stored history is never silently
/// rounded or reinterpreted on screen.
String formatGrade(num? grade, {String fallback = '—'}) {
  if (grade == null) return fallback;
  final value = grade.toDouble();
  if (!value.isFinite || value <= 0) return fallback;

  final tenths = value * 10;
  final isOnTenths = (tenths - tenths.round()).abs() < 1e-6;
  return isOnTenths ? value.toStringAsFixed(1) : value.toStringAsFixed(2);
}
