/** Epoch time with monotonic, sub-millisecond progression. */
export function clockNow(): number {
  return performance.timeOrigin + performance.now();
}

/** Four-timestamp NTP estimate, excluding server processing time from RTT. */
export function clockMeasurement(
  t0: number,
  t1: number,
  t2: number,
  t3: number,
) {
  return {
    offsetMs: (t1 - t0 + (t2 - t3)) / 2,
    roundTripMs: Math.max(0, t3 - t0 - (t2 - t1)),
  };
}
