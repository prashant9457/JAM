"use client";

import { Headphones, LoaderCircle, RotateCcw, Volume2 } from "lucide-react";
import type { MusicTrack } from "@/shared/music";
import type { useSyncedMusicPlayer } from "./hooks/useSyncedMusicPlayer";
import MusicCover from "./MusicCover";

type Props = {
  track: MusicTrack;
  player: ReturnType<typeof useSyncedMusicPlayer>;
  isPlaying: boolean;
  isSyncing: boolean;
  isPlaybackReady: boolean;
  isClockSynced: boolean;
  readyCount: number;
  participantCount: number;
};

export default function MusicNowPlaying({
  track,
  player,
  isPlaying,
  isSyncing,
  isPlaybackReady,
  isClockSynced,
  readyCount,
  participantCount,
}: Props) {
  const status = player.error
    ? "Track unavailable"
    : !player.loaded
      ? "Loading your track"
      : !player.enabled
        ? "Enable audio to listen"
        : !isClockSynced
          ? "Synchronizing your clock"
          : isSyncing
            ? "Waiting for the room"
            : isPlaying
              ? "Listening together"
              : "Ready when you are";
  return (
    <section
      aria-label="Now playing"
      className="flex flex-col items-center rounded-xl border border-neutral-800 bg-neutral-950/60 p-5 text-center sm:p-6"
    >
      <p className="mb-5 text-xs font-medium text-neutral-400">Now playing</p>
      <MusicCover track={track} large />
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-white">
        {track.title}
      </h2>
      <p className="mt-1 text-sm text-neutral-400">{track.artist}</p>
      <div
        role="status"
        aria-live="polite"
        className="mt-5 flex min-h-5 items-center gap-2 text-xs text-neutral-300"
      >
        {(!player.loaded || (isSyncing && player.enabled)) && !player.error ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : (
          <Headphones size={14} />
        )}
        {status}
      </div>
      {player.error ? (
        <div role="alert" className="mt-3">
          <p className="max-w-xs text-xs leading-5 text-red-300">
            {player.error}
          </p>
          <button
            type="button"
            onClick={player.retryLoad}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-neutral-700 px-4 text-sm text-white hover:bg-neutral-800"
          >
            <RotateCcw size={14} /> Retry track
          </button>
        </div>
      ) : !player.enabled ? (
        <button
          type="button"
          onClick={player.enableAudio}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-[#bbcf92] px-5 text-sm font-semibold text-neutral-950 hover:bg-[#d2e1b5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <Headphones size={16} /> Enable audio
        </button>
      ) : isSyncing ? (
        <p className="mt-3 text-xs leading-5 text-neutral-400">
          {readyCount} of {participantCount} listeners ready
          <br />
          {isPlaybackReady
            ? "You’re ready. Music starts when everyone is ready."
            : "Preparing audio on this device…"}
        </p>
      ) : (
        <p className="mt-3 text-xs leading-5 text-neutral-500">
          {participantCount} {participantCount === 1 ? "listener" : "listeners"}{" "}
          in this room
        </p>
      )}
      <label className="mt-6 flex w-full max-w-56 items-center gap-3 text-neutral-400">
        <Volume2 size={16} aria-hidden="true" />
        <span className="sr-only">Your volume</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(player.volume * 100)}
          onChange={(event) =>
            player.setVolume(Number(event.target.value) / 100)
          }
          className="h-1 min-w-0 flex-1 accent-[#bbcf92]"
        />
        <span className="w-8 text-right text-xs tabular-nums">
          {Math.round(player.volume * 100)}%
        </span>
      </label>
      <p className="mt-2 text-[11px] text-neutral-500">Volume on your device</p>
    </section>
  );
}
