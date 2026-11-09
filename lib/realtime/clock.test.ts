import assert from "node:assert/strict";
import test from "node:test";
import { clockMeasurement } from "./clock.ts";

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
