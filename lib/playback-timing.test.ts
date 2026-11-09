import assert from "node:assert/strict";
import test from "node:test";
import { expectedPosition, playbackStartDelay } from "./playback-timing.ts";
import type { PlaybackState } from "../shared/jam.ts";

const playback: PlaybackState = {
  status: "playing",
  mediaType: "video",
  trackId: "1E-JAofFdVQ",
  positionSeconds: 12,
  startsAtMs: 10_000,
};

test("different device clocks schedule the same server start", () => {
  assert.equal(playbackStartDelay(10_000, 8_000, 500), 1_500);
  assert.equal(playbackStartDelay(10_000, 9_000, -500), 1_500);
  assert.equal(expectedPosition(playback, 8_000 + 500 + 1_500), 12);
  assert.equal(expectedPosition(playback, 9_000 - 500 + 1_500), 12);
});

test("the playhead stays at its start position before the scheduled start", () => {
  assert.equal(expectedPosition(playback, 9_000), 12);
});

test("late starts and buffering recovery use the elapsed shared timeline", () => {
  assert.equal(playbackStartDelay(10_000, 12_000, 500), 0);
  assert.equal(expectedPosition(playback, 12_500), 14.5);
});

test("paused playback does not accumulate elapsed time", () => {
  assert.equal(
    expectedPosition(
      { ...playback, status: "paused", startsAtMs: null },
      30_000,
    ),
    12,
  );
});
