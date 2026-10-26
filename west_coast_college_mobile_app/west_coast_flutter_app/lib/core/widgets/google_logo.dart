import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Official-style multicolor Google "G", drawn with a [CustomPainter] so it
/// is crisp at any size and needs no image asset.
class GoogleLogo extends StatelessWidget {
  const GoogleLogo({super.key, this.size = 24});
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: const CustomPaint(painter: _GoogleLogoPainter()),
    );
  }
}

class _GoogleLogoPainter extends CustomPainter {
  const _GoogleLogoPainter();

  static const _blue = Color(0xFF4285F4);
  static const _green = Color(0xFF34A853);
  static const _yellow = Color(0xFFFBBC05);
  static const _red = Color(0xFFEA4335);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final stroke = s * 0.2;
    final center = Offset(s / 2, s / 2);
    final rect = Rect.fromCircle(center: center, radius: s / 2 - stroke / 2);

    double rad(double deg) => deg * math.pi / 180;

    void arc(Color color, double startDeg, double sweepDeg) {
      canvas.drawArc(
        rect,
        rad(startDeg),
        rad(sweepDeg),
        false,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.butt
          ..isAntiAlias = true,
      );
    }

    // Angles are clockwise from 3 o'clock.
    arc(_blue, -2, 52);
    arc(_green, 50, 90);
    arc(_yellow, 138, 76);
    arc(_red, 212, 106);

    // Horizontal bar of the "G".
    canvas.drawRect(
      Rect.fromLTRB(s * 0.5, center.dy - stroke / 2, s, center.dy + stroke / 2),
      Paint()
        ..color = _blue
        ..isAntiAlias = true,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
