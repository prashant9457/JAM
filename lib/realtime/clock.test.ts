import assert from "node:assert/strict";
import test from "node:test";
import { clockMeasurement, ClockSampleWindow } from "./clock.ts";

test("clock offset excludes server processing time", () => {
  // Clock is 500 ms ahead, each network leg is 20 ms, processing is 100 ms.
  assert.deepEqual(clockMeasurement(1_000, 1_520, 1_620, 1_140), {
    offsetMs: 500,
    roundTripMs: 40,
  });
});

test("negative offsets and sub-millisecond timestamps are retained", () => {
  const sample = clockMeasurement(1_000.25, 510.5, 512.5, 1_022.75);
  assert.equal(sample.offsetMs, -500);
  assert.equal(sample.roundTripMs, 20.5);
});

test("one congested clock burst cannot replace a cleaner timing estimate", () => {
  const window = new ClockSampleWindow();
  assert.equal(window.add([{ offsetMs: 500, roundTripMs: 20 }]).offsetMs, 500);
  assert.equal(
    window.add([{ offsetMs: 1_000, roundTripMs: 800 }]).offsetMs,
    500,
  );
  assert.equal(window.add([{ offsetMs: 502, roundTripMs: 10 }]).offsetMs, 502);
});

test("old clock estimates age out and non-finite observations are ignored", () => {
  const window = new ClockSampleWindow();
  window.add([{ offsetMs: 500, roundTripMs: 10 }]);
  const fresh = Array.from({ length: 60 }, () => ({
    offsetMs: 510,
    roundTripMs: 20,
  }));
  assert.equal(window.add(fresh).offsetMs, 510);
  assert.equal(
    window.add([{ offsetMs: Number.NaN, roundTripMs: 0 }]).offsetMs,
    510,
  );
});
