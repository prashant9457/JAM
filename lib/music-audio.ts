import type { PlaybackState } from "../shared/jam.ts";
import { expectedPosition, playbackStartDelay } from "./playback-timing.ts";

export function audioSchedule(
  playback: PlaybackState,
  serverOffsetMs: number,
  localNowMs: number,
  audioNow: number,
  outputLatency: number,
) {
  const latency = Number.isFinite(outputLatency)
    ? Math.max(0, Math.min(outputLatency, 0.25))
    : 0;
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
  private anchor: { when: number; offset: number } | null = null;

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
    const schedule = audioSchedule(
      playback,
      clockOffsetMs,
      localNowMs,
      this.context.currentTime,
      this.context.outputLatency ?? this.context.baseLatency ?? 0,
    );
    if (schedule.offset >= buffer.duration) {
      onEnded();
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
      onEnded();
    };
    this.source = source;
    this.anchor = schedule;
    source.start(schedule.when, schedule.offset);
  }

  get audiblePosition(): number | null {
    if (!this.anchor) return null;
    const latency = Math.max(
      0,
      Math.min(
        this.context.outputLatency ?? this.context.baseLatency ?? 0,
        0.25,
      ),
    );
    return (
      this.anchor.offset +
      Math.max(0, this.context.currentTime - latency - this.anchor.when)
    );
  }

  async close() {
    this.stop();
    this.buffers.clear();
    if (this.context.state !== "closed") await this.context.close();
  }
}
