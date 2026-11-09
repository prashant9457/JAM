"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Maximize, Minimize, Play } from "lucide-react";
import type { PlaybackState } from "@/shared/jam";
import { useSyncedYouTubePlayer } from "./hooks/useSyncedYouTubePlayer";

type YouTubeVideoProps = {
  playback: PlaybackState;
  serverClockOffsetMs: number;
  onDurationChange: (durationSeconds: number) => void;
  mediaType: "music" | "video";
  onEnded?: () => void;
  onFullscreenFallbackChange?: (fullscreen: boolean) => void;
  isSyncing?: boolean;
  onPlaybackReady?: (trackId: string) => void;
  readyCount: number;
  isPlaybackReady: boolean;
  participantCount: number;
  isPreparing: boolean;
  onPreparationReady: (measurement: {
    startupMs: number;
    loadedSeconds: number;
  }) => void;
  onPreparationError: (message: string) => void;
};

export default function YouTubeVideo({
  playback,
  serverClockOffsetMs,
  onDurationChange,
  mediaType,
  onEnded,
  onFullscreenFallbackChange,
  isSyncing,
  onPlaybackReady,
  readyCount,
  isPlaybackReady,
  participantCount,
  isPreparing,
  onPreparationReady,
  onPreparationError,
}: YouTubeVideoProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const {
    mountRef,
    playerReady,
    playerError,
    autoplayBlocked,
    hasBegun,
    resumePlayback,
  } = useSyncedYouTubePlayer({
    playback,
    serverClockOffsetMs,
    onDurationChange,
    onEnded,
    isSyncing,
    onPlaybackReady,
    isPreparing,
    onPreparationReady,
    onPreparationError,
  });

  useEffect(() => {
    function syncFullscreenState() {
      const nativeFullscreen = document.fullscreenElement === frameRef.current;
      setIsFullscreen(nativeFullscreen);
      if (!nativeFullscreen) onFullscreenFallbackChange?.(false);
    }
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, [onFullscreenFallbackChange]);

  async function toggleFullscreen() {
    const frame = frameRef.current;
    if (!frame) return;
    if (isFullscreen && !document.fullscreenElement) {
      setIsFullscreen(false);
      onFullscreenFallbackChange?.(false);
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (typeof frame.requestFullscreen === "function")
        await frame.requestFullscreen();
      else throw new Error("Fullscreen API unavailable");
    } catch {
      setIsFullscreen(true);
      onFullscreenFallbackChange?.(true);
    }
  }

  return (
    <section
      aria-label={
        mediaType === "video" ? "Shared YouTube video" : "Shared music"
      }
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col justify-center"
    >
      <div
        ref={frameRef}
        className={`${isFullscreen ? "fixed inset-0 z-[100] h-dvh w-screen max-w-none rounded-none border-0" : "relative mx-auto aspect-video w-full max-w-full rounded-xl border border-neutral-800"} overflow-hidden bg-black`}
        style={{
          width: isFullscreen
            ? "100vw"
            : "min(100%, max(284px, calc((100dvh - 468px) * 16 / 9)))",
          maxHeight: isFullscreen
            ? "100dvh"
            : "max(160px, calc(100dvh - 468px))",
        }}
      >
        <div
          ref={mountRef}
          className={`absolute inset-0 ${mediaType === "music" ? "opacity-0" : ""}`}
        />

        {mediaType === "music" && !playerError && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[5] flex items-center justify-center gap-5 bg-[#181818] p-5 sm:gap-8"
            style={{
              backgroundImage: `linear-gradient(90deg, rgba(24,24,24,.96), rgba(24,24,24,.65)), url(https://i.ytimg.com/vi/${playback.trackId}/hqdefault.jpg)`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          >
            <div
              className="h-24 w-24 shrink-0 rounded-md border border-white/10 bg-neutral-900 bg-cover bg-center sm:h-36 sm:w-36"
              style={{
                backgroundImage: `url(https://i.ytimg.com/vi/${playback.trackId}/hqdefault.jpg)`,
              }}
            />
            <div className="min-w-0">
              <p className="text-xs text-neutral-400">JAM MUSIC</p>
              <p className="mt-1 truncate text-lg font-semibold text-white sm:text-xl">
                Shared music
              </p>
              <p className="mt-1 text-sm text-neutral-400">Playing in sync</p>
            </div>
          </div>
        )}

        {mediaType === "video" &&
          playback.status !== "playing" &&
          !playerError && (
            <div
              aria-hidden="true"
              className="absolute inset-0 z-[5] bg-neutral-950 bg-cover bg-center"
              style={{
                backgroundImage: `url(https://i.ytimg.com/vi/${playback.trackId}/hqdefault.jpg)`,
              }}
            />
          )}

        {/* Keep video playback controlled by the room's shared player bar. */}
        {mediaType === "video" && !playerError && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[6] bg-transparent"
            onClick={(event) => event.preventDefault()}
            onDoubleClick={(event) => event.preventDefault()}
          />
        )}

        {mediaType === "video" && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void toggleFullscreen();
            }}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="absolute bottom-3 right-3 z-[8] grid h-9 w-9 place-items-center rounded-md bg-black/65 text-white hover:bg-black/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>
        )}

        {((isSyncing && !isPlaybackReady) ||
          (playback.status === "playing" && (!hasBegun || autoplayBlocked))) &&
          !playerError && (
            <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 p-6 text-center">
              <div>
                <h2 className="font-medium text-white">Playback needs a tap</h2>
                {isSyncing && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="mt-2 text-xs text-neutral-300"
                  >
                    {readyCount} of {participantCount} ready. Tap Begin video
                    when you are ready.
                  </p>
                )}
                <button
                  type="button"
                  onClick={resumePlayback}
                  disabled={!playerReady}
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-wait disabled:opacity-60"
                >
                  <Play size={15} fill="currentColor" />
                  {playerReady ? "Begin video" : "Loading…"}
                </button>
              </div>
            </div>
          )}

        {playerError && (
          <div
            role="alert"
            className="absolute inset-0 z-10 grid place-items-center bg-neutral-950 p-6 text-center"
          >
            <div className="max-w-md">
              <p className="text-sm text-neutral-200">{playerError}</p>
              <a
                href={`https://www.youtube.com/watch?v=${playback.trackId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-neutral-300 hover:text-white"
              >
                Open on YouTube <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}
        {isSyncing && !playerError && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-20 grid place-items-center bg-black/75 p-6 text-center backdrop-blur-sm"
          >
            <div>
              <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              <p className="text-sm font-medium text-white">
                {isPlaybackReady
                  ? "You’re ready"
                  : "Waiting for everyone to tap Begin video"}
              </p>
              <p className="mt-1 text-xs text-neutral-300">
                {readyCount} of {participantCount} ready · Waiting for everyone…
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
