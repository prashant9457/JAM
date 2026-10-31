"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaybackState } from "@/shared/jam";
import { loadYouTubeIframeApi, type YouTubePlayerState } from "@/lib/youtube-iframe";

type UseSyncedYouTubePlayerOptions = {
  playback: PlaybackState;
  serverClockOffsetMs: number;
  onDurationChange: (durationSeconds: number) => void;
  onEnded?: () => void;
};

function expectedPosition(playback: PlaybackState, serverNowMs: number): number {
  if (playback.status !== "playing" || playback.startsAtMs === null) return playback.positionSeconds;
  return playback.positionSeconds + Math.max(0, serverNowMs - playback.startsAtMs) / 1_000;
}

export function useSyncedYouTubePlayer({ playback, serverClockOffsetMs, onDurationChange, onEnded }: UseSyncedYouTubePlayerOptions) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerState | null>(null);
  const playbackStatus = playback.status;
  const trackId = playback.trackId;
  const positionSeconds = playback.positionSeconds;
  const startsAtMs = playback.startsAtMs;
  const playbackRef = useRef<PlaybackState>(playback);
  const durationRef = useRef(0);
  const onEndedRef = useRef(onEnded);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    playbackRef.current = { status: playbackStatus, mediaType: playback.mediaType, trackId, positionSeconds, startsAtMs };
  }, [playbackStatus, playback.mediaType, trackId, positionSeconds, startsAtMs]);

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayerState | null = null;

    void loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !mountRef.current || !trackId) return;

        player = new youtube.Player(mountRef.current, {
          videoId: trackId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = player;
              const duration = player?.getDuration() ?? 0;
              if (duration > 0) {
                durationRef.current = duration;
                onDurationChange(duration);
              }
              setPlayerReady(true);
            },
            onStateChange: (event) => {
              // Keep playback host-controlled if a player event starts audio unexpectedly.
              if (event.data === 1) {
                setAutoplayBlocked(false);
                if (playbackRef.current.status !== "playing") window.setTimeout(() => player?.pauseVideo(), 100);
              } else if (event.data === 0) {
                onEndedRef.current?.();
              }
            },
            onError: (event) => {
              setPlayerError(event.data === 101 || event.data === 150
                ? "This video does not allow embedded playback. Open it on YouTube instead."
                : "YouTube could not play this video in the embedded player.");
            },
          },
        });
      })
      .catch((error: unknown) => {
        setPlayerError(error instanceof Error ? error.message : "Could not load YouTube.");
      });

    return () => {
      cancelled = true;
      playerRef.current = null;
      player?.destroy();
    };
  }, [onDurationChange, trackId]);

  // Apply the server's scheduled timeline whenever the host changes playback state.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady) return;

    const currentPlayback: PlaybackState = { status: playbackStatus, mediaType: playback.mediaType, trackId, positionSeconds, startsAtMs };
    if (playbackStatus !== "playing") {
      player.pauseVideo();
      if (Math.abs(player.getCurrentTime() - positionSeconds) > 1.25) player.seekTo(positionSeconds, true);
      return;
    }

    const localStartAtMs = (startsAtMs ?? Date.now()) - serverClockOffsetMs;
    const delayMs = Math.max(0, localStartAtMs - Date.now());
    const nowPosition = expectedPosition(currentPlayback, Date.now() + serverClockOffsetMs);

    player.pauseVideo();
    player.seekTo(delayMs > 50 ? positionSeconds : nowPosition, true);

    const playTimer = window.setTimeout(() => {
      player.seekTo(expectedPosition(currentPlayback, Date.now() + serverClockOffsetMs), true);
      player.playVideo();
    }, delayMs);
    const autoplayTimer = window.setTimeout(() => {
      if (player.getPlayerState() !== 1) setAutoplayBlocked(true);
      else setAutoplayBlocked(false);
    }, delayMs + 1_500);

    return () => {
      window.clearTimeout(playTimer);
      window.clearTimeout(autoplayTimer);
    };
  }, [playerReady, playbackStatus, playback.mediaType, trackId, positionSeconds, startsAtMs, serverClockOffsetMs]);

  // Periodic drift correction keeps clients near the shared timeline.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || playbackStatus !== "playing") return;

    const interval = window.setInterval(() => {
      const expected = expectedPosition(playbackRef.current, Date.now() + serverClockOffsetMs);
      if (Math.abs(expected - player.getCurrentTime()) > 1.5) player.seekTo(expected, true);
      if (player.getPlayerState() !== 1) player.playVideo();
    }, 3_000);

    return () => window.clearInterval(interval);
  }, [playerReady, playbackStatus, serverClockOffsetMs]);

  useEffect(() => {
    if (!playerReady) return;
    const interval = window.setInterval(() => {
      const duration = playerRef.current?.getDuration() ?? 0;
      if (duration > 0 && Math.abs(duration - durationRef.current) > 1) {
        durationRef.current = duration;
        onDurationChange(duration);
      }
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [onDurationChange, playerReady]);

  function resumePlayback() {
    const player = playerRef.current;
    if (!player) return;
    player.unMute();
    player.playVideo();
    setAutoplayBlocked(false);
  }

  return { mountRef, playerReady, playerError, autoplayBlocked, resumePlayback };
}
