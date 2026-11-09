import type { PlaybackState } from "../shared/jam.ts";
import { expectedPosition, playbackStartDelay } from "./playback-timing.ts";
import { driftAdjustment, trustedOutputLatency } from "./music-drift.ts";

export function audioSchedule(
  playback: PlaybackState,
  serverOffsetMs: number,
  localNowMs: number,
  audioNow: number,
  outputLatency: number,
) {
  const latency = trustedOutputLatency(outputLatency);
  const untilAudible =
    playbackStartDelay(playback.startsAtMs, localNowMs, serverOffsetMs) / 1_000;
  const delay = Math.max(0, untilAudible - latency);
  // If the command arrived late, join the current position rather than starting at zero.
  const offset = expectedPosition(
    playback,
    localNowMs + serverOffsetMs + (latency + delay) * 1_000,
  );
  return { when: audioNow + delay, offset };
}

/** A fresh one-shot source per play; decoded buffers are cached, never streamed mid-song. */
export class MusicAudioEngine {
  readonly context: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private anchor: {
    when: number;
    offset: number;
    startOffset: number;
    latency: number;
    rate: number;
  } | null = null;
  private activeKey: string | null = null;
  private activeBuffer: AudioBuffer | null = null;
  private endedKey: string | null = null;
  private largeDriftSamples = 0;

  constructor(context: AudioContext) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.value = 0.7;
    this.gain.connect(context.destination);
  }

  async load(url: string, signal: AbortSignal): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) {
      this.buffers.delete(url);
      this.buffers.set(url, cached);
      return cached;
    }
    const response = await fetch(url, { signal });
    if (!response.ok)
      throw new Error("Could not download this track. Please retry.");
    const buffer = await this.context.decodeAudioData(
      await response.arrayBuffer(),
    );
    signal.throwIfAborted();
    this.buffers.set(url, buffer);
    if (this.buffers.size > 3)
      this.buffers.delete(this.buffers.keys().next().value!);
    return buffer;
  }

  setVolume(volume: number) {
    this.gain.gain.setTargetAtTime(
      Math.max(0, Math.min(volume, 1)),
      this.context.currentTime,
      0.02,
    );
  }

  stop() {
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    this.anchor = null;
    this.activeKey = null;
    this.activeBuffer = null;
    this.largeDriftSamples = 0;
  }

  synchronize(
    buffer: AudioBuffer,
    playback: PlaybackState,
    clockOffsetMs: number,
    localNowMs: number,
    onEnded: () => void,
  ) {
    const key = timelineKey(playback);
    if (
      this.endedKey === key ||
      (this.source && this.activeKey === key && this.activeBuffer === buffer)
    )
      return;
    this.play(buffer, playback, clockOffsetMs, localNowMs, onEnded);
  }

  reconcile(
    buffer: AudioBuffer,
    playback: PlaybackState,
    clockOffsetMs: number,
    localNowMs: number,
    onEnded: () => void,
  ) {
    if (!this.source || !this.anchor || this.context.state !== "running")
      return;
    if (
      playback.startsAtMs !== null &&
      localNowMs + clockOffsetMs < playback.startsAtMs
    )
      return;
    const actual = this.audiblePosition;
    if (actual === null) return;
    const adjustment = driftAdjustment(
      expectedPosition(playback, localNowMs + clockOffsetMs) - actual,
      this.largeDriftSamples,
    );
    this.largeDriftSamples = adjustment.largeSamples;
    if (adjustment.restart) {
      this.play(buffer, playback, clockOffsetMs, localNowMs, onEnded);
      return;
    }
    if (
      adjustment.rate !== this.anchor.rate &&
      this.context.currentTime >= this.anchor.when
    ) {
      this.anchor.offset +=
        (this.context.currentTime - this.anchor.when) * this.anchor.rate;
      this.anchor.when = this.context.currentTime;
      this.anchor.rate = adjustment.rate;
      this.source.playbackRate.setValueAtTime(
        adjustment.rate,
        this.context.currentTime,
      );
    }
  }

  play(
    buffer: AudioBuffer,
    playback: PlaybackState,
    clockOffsetMs: number,
    localNowMs: number,
    onEnded: () => void,
  ) {
    this.stop();
    if (this.context.state !== "running") return;
    const key = timelineKey(playback);
    const latency = trustedOutputLatency(this.context.outputLatency ?? 0);
    const schedule = audioSchedule(
      playback,
      clockOffsetMs,
      localNowMs,
      this.context.currentTime,
      latency,
    );
    if (schedule.offset >= buffer.duration) {
      if (this.endedKey !== key) {
        this.endedKey = key;
        onEnded();
      }
      return;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.onended = () => {
      if (this.source !== source) return;
      this.source = null;
      this.anchor = null;
      source.disconnect();
      if (this.endedKey !== key) {
        this.endedKey = key;
        onEnded();
      }
    };
    this.source = source;
    this.activeKey = key;
    this.activeBuffer = buffer;
    this.anchor = {
      ...schedule,
      startOffset: schedule.offset,
      latency,
      rate: 1,
    };
    source.start(schedule.when, schedule.offset);
  }

  get audiblePosition(): number | null {
    if (!this.anchor) return null;
    return Math.max(
      this.anchor.startOffset,
      this.anchor.offset +
        (this.context.currentTime - this.anchor.latency - this.anchor.when) *
          this.anchor.rate,
    );
  }

  async close() {
    this.stop();
    this.buffers.clear();
    if (this.context.state !== "closed") await this.context.close();
  }
}

function timelineKey(playback: PlaybackState): string {
  return JSON.stringify([
    playback.trackId,
    playback.status,
    playback.positionSeconds,
    playback.startsAtMs,
  ]);
}
