"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import type { PlaybackState } from "@/shared/jam";
import type { QueueItem } from "@/shared/jam";
import { getYouTubeVideoId } from "@/lib/youtube-url";
import SpotlightCard from "@/components/ui/SpotlightCard";
import QueuePanel from "./QueuePanel";
import YouTubeVideo from "./YouTubeVideo";
import MusicWorkspace from "./MusicWorkspace";

type TrackWorkspaceProps = {
  playback: PlaybackState;
  serverClockOffsetMs: number;
  onDurationChange: (durationSeconds: number) => void;
  clockRoundTripMs: number | null;
  isClockSynced: boolean;
  onPlayMusic: (trackId: string) => void;
  isHost: boolean;
  onMediaTypeChange: (mediaType: "music" | "video") => void;
  queue: QueueItem[];
  onAddToQueue: (trackId: string, mediaType: "music" | "video") => void;
  onMoveQueueItem: (itemId: string, toIndex: number) => void;
  onRemoveQueueItem: (itemId: string) => void;
  onPlayQueueItem: (itemId: string) => void;
  onTrackEnded?: () => void;
  onFullscreenFallbackChange: (fullscreen: boolean) => void;
  isFullscreenFallback: boolean;
  isSyncing: boolean;
  onPlaybackReady: (trackId: string) => void;
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

export default function TrackWorkspace({
  playback,
  serverClockOffsetMs,
  onDurationChange,
  clockRoundTripMs,
  isClockSynced,
  onPlayMusic,
  isHost,
  onMediaTypeChange,
  queue,
  onAddToQueue,
  onMoveQueueItem,
  onRemoveQueueItem,
  onPlayQueueItem,
  onTrackEnded,
  onFullscreenFallbackChange,
  isFullscreenFallback,
  isSyncing,
  onPlaybackReady,
  readyCount,
  isPlaybackReady,
  participantCount,
  isPreparing,
  onPreparationReady,
  onPreparationError,
}: TrackWorkspaceProps) {
  const [videoUrl, setVideoUrl] = useState("");
  const [urlError, setUrlError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const videoId = getYouTubeVideoId(videoUrl);
    if (!videoId) {
      setUrlError("Enter a valid YouTube video link.");
      return;
    }
    setUrlError("");
    onAddToQueue(videoId, playback.mediaType);
    setVideoUrl("");
  }

  return (
    <main
      className={`min-h-0 min-w-0 bg-[#121212] p-4 text-white sm:p-6 ${isFullscreenFallback ? "overflow-visible" : "overflow-hidden"}`}
    >
      <SpotlightCard
        className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-3 rounded-none bg-transparent p-0 shadow-none"
        spotlightColor="#ffffff"
        intensity={0.035}
        spotlightSize={360}
        borderGlow={0.08}
        proximity={24}
        smoothing={0.45}
        flare={false}
        style={
          {
            overflow: isFullscreenFallback ? "visible" : "hidden",
            padding: 0,
            borderRadius: 0,
            background: "transparent",
            boxShadow: "none",
            "--spotlight-card-border": "transparent",
            "--spotlight-card-surface": "transparent",
            "--spotlight-card-shadow": "none",
          } as CSSProperties
        }
      >
        <header className="shrink-0 border-b border-neutral-800 pb-3">
          <div className="flex min-h-9 items-center justify-between gap-3">
            <h1 className="text-sm font-semibold text-neutral-100">
              {playback.mediaType === "video" ? "Video" : "Music"}
            </h1>
            <div
              className="flex items-center rounded-md border border-neutral-800 p-0.5"
              role="group"
              aria-label="Choose playback mode"
            >
              {(["music", "video"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={playback.mediaType === mode}
                  disabled={!isHost}
                  onClick={() => onMediaTypeChange(mode)}
                  className={`rounded px-3 py-1.5 text-xs capitalize disabled:cursor-not-allowed ${playback.mediaType === mode ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          {playback.mediaType === "video" && (
            <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
              <label htmlFor="video-url" className="sr-only">
                YouTube link for the queue
              </label>
              <input
                id="video-url"
                type="url"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder={
                  isHost
                    ? `Paste a YouTube link to add ${playback.mediaType}`
                    : "The host can add a YouTube link"
                }
                disabled={!isHost}
                className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!isHost || !videoUrl.trim()}
                className="rounded-md bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                Add to queue
              </button>
            </form>
          )}
          {urlError && (
            <p role="alert" className="mt-2 text-xs text-neutral-300">
              {urlError}
            </p>
          )}
        </header>
        {playback.mediaType === "music" ? (
          <MusicWorkspace
            playback={playback}
            serverClockOffsetMs={serverClockOffsetMs}
            clockRoundTripMs={clockRoundTripMs}
            isClockSynced={isClockSynced}
            isHost={isHost}
            isSyncing={isSyncing}
            isPlaybackReady={isPlaybackReady}
            readyCount={readyCount}
            participantCount={participantCount}
            queue={queue}
            onPlayMusic={onPlayMusic}
            onAddToQueue={onAddToQueue}
            onMoveQueueItem={onMoveQueueItem}
            onRemoveQueueItem={onRemoveQueueItem}
            onPlayQueueItem={onPlayQueueItem}
            onPlaybackReady={onPlaybackReady}
            onDurationChange={onDurationChange}
            onEnded={onTrackEnded}
          />
        ) : (
          <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(110px,0.7fr)] gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,34%)] md:grid-rows-1 md:gap-6">
            <div className="flex min-h-0 min-w-0 items-center justify-center">
              <YouTubeVideo
                playback={playback}
                serverClockOffsetMs={serverClockOffsetMs}
                onDurationChange={onDurationChange}
                mediaType={playback.mediaType}
                onEnded={onTrackEnded}
                onFullscreenFallbackChange={onFullscreenFallbackChange}
                isSyncing={isSyncing}
                onPlaybackReady={onPlaybackReady}
                readyCount={readyCount}
                isPlaybackReady={isPlaybackReady}
                participantCount={participantCount}
                isPreparing={isPreparing}
                onPreparationReady={onPreparationReady}
                onPreparationError={onPreparationError}
              />
            </div>
            <QueuePanel
              queue={queue}
              isHost={isHost}
              onMove={onMoveQueueItem}
              onRemove={onRemoveQueueItem}
              onPlay={onPlayQueueItem}
            />
          </div>
        )}
      </SpotlightCard>
    </main>
  );
}
