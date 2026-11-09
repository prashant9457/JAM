export function trustedOutputLatency(seconds: number): number {
  // Large Bluetooth reports are inconsistent across browsers; don't turn them into a seek.
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 0.1
    ? seconds
    : 0;
}

export function driftAdjustment(
  driftSeconds: number,
  previousLargeSamples: number,
) {
  const magnitude = Math.abs(driftSeconds);
  if (magnitude > 0.5) {
    const largeSamples = previousLargeSamples + 1;
    return { rate: 1, largeSamples, restart: largeSamples >= 3 };
  }
  const rate =
    magnitude < 0.03
      ? 1
      : Math.max(0.995, Math.min(1.005, 1 + driftSeconds * 0.02));
  return { rate, largeSamples: 0, restart: false };
}
