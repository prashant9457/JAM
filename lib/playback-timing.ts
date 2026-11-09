import type { PlaybackState } from "../shared/jam.ts";

export const MAX_PLAYBACK_DRIFT_SECONDS = 0.4;

export function expectedPosition(
  playback: PlaybackState,
  serverNowMs: number,
): number {
  if (playback.status !== "playing" || playback.startsAtMs === null)
    return playback.positionSeconds;
  return (
    playback.positionSeconds +
    Math.max(0, serverNowMs - playback.startsAtMs) / 1_000
  );
}

export function playbackStartDelay(
  startsAtMs: number | null,
  localNowMs: number,
  serverClockOffsetMs: number,
): number {
  return startsAtMs === null
    ? 0
    : Math.max(0, startsAtMs - (localNowMs + serverClockOffsetMs));
}
