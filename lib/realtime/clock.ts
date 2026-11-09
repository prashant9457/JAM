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

type ClockSample = { offsetMs: number; roundTripMs: number };

/** Keep the least queued observation across batches, rather than jumping to every new burst. */
export class ClockSampleWindow {
  private samples: ClockSample[] = [];

  add(samples: ClockSample[]): ClockSample {
    this.samples = [
      ...this.samples,
      ...samples.filter(
        (sample) =>
          Number.isFinite(sample.offsetMs) &&
          Number.isFinite(sample.roundTripMs) &&
          sample.roundTripMs >= 0,
      ),
    ].slice(-60);
    if (this.samples.length === 0)
      throw new Error("No valid room clock measurements.");
    return this.samples.reduce((best, sample) =>
      sample.roundTripMs < best.roundTripMs ? sample : best,
    );
  }
}
