import assert from "node:assert/strict";
import { openSync, readSync, closeSync, statSync } from "node:fs";
import test from "node:test";
import { audioSchedule, MusicAudioEngine } from "./music-audio.ts";
import { MUSIC_TRACKS } from "../shared/music.ts";
import type { PlaybackState } from "../shared/jam.ts";

const timeline: PlaybackState = {
  status: "playing",
  mediaType: "music",
  trackId: MUSIC_TRACKS[0].id,
  positionSeconds: 12,
  startsAtMs: 10_000,
};

function fakeContext(state = "running") {
  const sources: {
    onended: (() => void) | null;
    startArgs: number[];
    stopped: boolean;
    disconnected: boolean;
    buffer: unknown;
    playbackRate: {
      value: number;
      setValueAtTime: (value: number, time: number) => void;
    };
    connect: () => void;
    start: (when: number, offset: number) => void;
    stop: () => void;
    disconnect: () => void;
  }[] = [];
  const context = {
    state,
    currentTime: 5,
    outputLatency: 0.05,
    baseLatency: 0,
    destination: {},
    createGain: () => ({
      gain: { value: 1, setTargetAtTime: () => {} },
      connect: () => {},
    }),
    createBufferSource: () => {
      const source = {
        onended: null as (() => void) | null,
        startArgs: [] as number[],
        stopped: false,
        disconnected: false,
        buffer: null as unknown,
        playbackRate: {
          value: 1,
          setValueAtTime(value: number) {
            this.value = value;
          },
        },
        connect() {},
        start(when: number, offset: number) {
          this.startArgs = [when, offset];
        },
        stop() {
          this.stopped = true;
          this.onended?.();
        },
        disconnect() {
          this.disconnected = true;
        },
      };
      sources.push(source);
      return source;
    },
    decodeAudioData: async () => ({ duration: 180 }),
    close: async () => {},
  };
  return {
    context,
    sources,
    engine: new MusicAudioEngine(context as unknown as AudioContext),
  };
}

test("devices with different clocks and output latency reach the same audible start", () => {
  const first = audioSchedule(timeline, 500, 8_000, 5, 0.05);
  const second = audioSchedule(timeline, -500, 9_000, 20, 0.1);
  assert.equal(first.offset, 12);
  assert.equal(second.offset, 12);
  assert.equal(first.when, 6.45);
  assert.equal(second.when, 21.4);
  assert.ok(
    Math.abs(first.when - 5 + 0.05 - (second.when - 20 + 0.1)) < 0.00001,
  );
});

test("late listeners catch up including output latency instead of restarting", () => {
  const schedule = audioSchedule(timeline, 500, 11_000, 5, 0.1);
  assert.equal(schedule.when, 5);
  assert.equal(schedule.offset, 13.6);
});

test("invalid and excessive latency readings remain bounded", () => {
  assert.equal(audioSchedule(timeline, 0, 9_000, 5, Number.NaN).when, 6);
  assert.equal(audioSchedule(timeline, 0, 9_000, 5, -2).when, 6);
  assert.equal(audioSchedule(timeline, 0, 9_000, 5, 10).when, 6);
});

test("rescheduling stops the old source without advancing the queue", () => {
  const { engine, sources } = fakeContext();
  let ends = 0;
  const buffer = { duration: 180 } as AudioBuffer;
  engine.play(buffer, timeline, 500, 8_000, () => ends++);
  engine.play(buffer, timeline, 500, 8_000, () => ends++);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].stopped, true);
  assert.equal(sources[0].disconnected, true);
  assert.equal(ends, 0);
  sources[1].onended?.();
  assert.equal(ends, 1);
  assert.equal(engine.audiblePosition, null);
});

test("clock refreshes and repeated snapshots do not restart the running song", () => {
  const { engine, sources, context } = fakeContext();
  const buffer = { duration: 180 } as AudioBuffer;
  engine.synchronize(buffer, timeline, 500, 8_000, () => {});
  context.currentTime = 8;
  engine.synchronize(buffer, { ...timeline }, 530, 11_000, () => {});
  assert.equal(sources.length, 1);
  assert.equal(sources[0].stopped, false);
  engine.synchronize(
    buffer,
    { ...timeline, startsAtMs: 20_000 },
    530,
    11_000,
    () => {},
  );
  assert.equal(sources.length, 2);
  assert.equal(sources[0].stopped, true);
});

test("ordinary clock drift adjusts playback gently without stopping audio", () => {
  const { engine, sources, context } = fakeContext();
  const buffer = { duration: 180 } as AudioBuffer;
  engine.synchronize(buffer, timeline, 500, 8_000, () => {});
  context.currentTime = 8;
  engine.reconcile(buffer, timeline, 600, 11_000, () => {});
  assert.equal(sources.length, 1);
  assert.equal(sources[0].stopped, false);
  assert.ok(
    sources[0].playbackRate.value > 1 && sources[0].playbackRate.value <= 1.005,
  );
  context.currentTime = 9;
  engine.reconcile(buffer, timeline, 500, 12_000, () => {});
  assert.equal(sources[0].playbackRate.value, 1);
  assert.equal(sources.length, 1);
});

test("one noisy large clock sample does not seek; sustained large drift can recover", () => {
  const { engine, sources, context } = fakeContext();
  const buffer = { duration: 180 } as AudioBuffer;
  engine.synchronize(buffer, timeline, 500, 8_000, () => {});
  context.currentTime = 8;
  engine.reconcile(buffer, timeline, 2_500, 11_000, () => {});
  assert.equal(sources.length, 1);
  engine.reconcile(buffer, timeline, 500, 11_000, () => {});
  assert.equal(sources.length, 1);
  for (let index = 0; index < 3; index++)
    engine.reconcile(buffer, timeline, 2_500, 11_000, () => {});
  assert.equal(sources.length, 2);
});

test("changing device latency reports cannot repeatedly jump the audio playhead", () => {
  const { engine, context } = fakeContext();
  engine.synchronize(
    { duration: 180 } as AudioBuffer,
    timeline,
    500,
    8_000,
    () => {},
  );
  context.currentTime = 8;
  const before = engine.audiblePosition;
  context.outputLatency = 0.8;
  assert.equal(engine.audiblePosition, before);
});

test("a completed timeline advances the queue only once despite duplicate updates", () => {
  const { engine } = fakeContext();
  const buffer = { duration: 1 } as AudioBuffer;
  let ended = 0;
  engine.synchronize(buffer, timeline, 500, 11_000, () => ended++);
  engine.synchronize(buffer, { ...timeline }, 510, 11_000, () => ended++);
  assert.equal(ended, 1);
});

test("pause cancels scheduled audio and suspended contexts never start", () => {
  const { engine, sources } = fakeContext();
  engine.play({ duration: 180 } as AudioBuffer, timeline, 500, 8_000, () =>
    assert.fail("stopping must not end the track"),
  );
  engine.stop();
  assert.equal(sources[0].stopped, true);
  assert.equal(engine.audiblePosition, null);
  const suspended = fakeContext("suspended");
  suspended.engine.play(
    { duration: 180 } as AudioBuffer,
    timeline,
    500,
    8_000,
    () => {},
  );
  assert.equal(suspended.sources.length, 0);
});

test("an arrival after the track ended advances without creating an invalid source", () => {
  const { engine, sources } = fakeContext();
  let ended = false;
  engine.play({ duration: 1 } as AudioBuffer, timeline, 500, 11_000, () => {
    ended = true;
  });
  assert.equal(sources.length, 0);
  assert.equal(ended, true);
});

test("decoded buffers are reused with a three-track cache", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response(new Uint8Array([1, 2, 3]));
  });
  const { engine } = fakeContext();
  const signal = new AbortController().signal;
  const first = await engine.load("/a.mp3", signal);
  assert.equal(await engine.load("/a.mp3", signal), first);
  assert.equal(requests, 1);
  await engine.load("/b.mp3", signal);
  await engine.load("/c.mp3", signal);
  await engine.load("/d.mp3", signal);
  await engine.load("/a.mp3", signal);
  assert.equal(requests, 5);
});

test("download failures do not produce a decoded ready buffer", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("missing", { status: 404 }),
  );
  const { engine } = fakeContext();
  await assert.rejects(
    engine.load("/missing.mp3", new AbortController().signal),
    /download/,
  );
});

test("each default catalog entry has a bundled MP3 rather than an HTML error page", () => {
  for (const track of MUSIC_TRACKS) {
    const file = new URL(`../public${track.src}`, import.meta.url);
    assert.ok(statSync(file).size > 100_000, track.title);
    const descriptor = openSync(file, "r");
    const header = Buffer.alloc(3);
    try {
      readSync(descriptor, header, 0, 3, 0);
    } finally {
      closeSync(descriptor);
    }
    assert.ok(
      header.toString() === "ID3" ||
        (header[0] === 0xff && (header[1] & 0xe0) === 0xe0),
      track.title,
    );
  }
});
