import 'dart:async';

import 'package:flutter/material.dart';

/// Staggered entrance effects, dependency-free.
///
/// Each [Entrance] fades + slides + subtly scales its child in once, with a
/// delay derived from its `order` so list/section content cascades instead
/// of popping in as one block. Runs exactly one animation per widget per
/// page build — cheap enough to use freely.

class Entrance extends StatefulWidget {
  const Entrance({
    super.key,
    required this.child,
    this.order = 0,
    this.delayMs = 55,
    this.durationMs = 420,
    this.slideBy = .045,
  });

  /// Position in the cascade (0 = first, no delay).
  final int order;
  final int delayMs;
  final int durationMs;
  final Widget child;
  /// Fraction of the screen the child slides up from.
  final double slideBy;

  @override
  State<Entrance> createState() => _EntranceState();
}

class _EntranceState extends State<Entrance> {
  bool _entered = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.order <= 0) {
      _entered = true;
    } else {
      _timer = Timer(Duration(milliseconds: widget.order * widget.delayMs), () {
        if (mounted) setState(() => _entered = true);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSlide(
      offset: _entered ? Offset.zero : Offset(0, widget.slideBy),
      duration: Duration(milliseconds: widget.durationMs),
      curve: Curves.easeOutCubic,
      child: AnimatedScale(
        scale: _entered ? 1.0 : 0.97,
        duration: Duration(milliseconds: widget.durationMs),
        curve: Curves.easeOutBack,
        child: AnimatedOpacity(
          opacity: _entered ? 1.0 : 0.0,
          duration: Duration(milliseconds: widget.durationMs),
          curve: Curves.easeOut,
          child: widget.child,
        ),
      ),
    );
  }
}

/// Convenience: stagger an existing list of children.
class EntranceList extends StatelessWidget {
  const EntranceList({
    super.key,
    required this.children,
    this.start = 1,
    this.delayMs = 55,
  });

  final List<Widget> children;
  final int start;
  final int delayMs;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < children.length; i++)
          Entrance(
            order: start + i,
            delayMs: delayMs,
            child: children[i],
          ),
      ],
    );
  }
}
