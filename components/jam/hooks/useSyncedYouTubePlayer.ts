"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaybackState } from "@/shared/jam";
import { loadYouTubeIframeApi, type YouTubePlayerState } from "@/lib/youtube-iframe";

type UseSyncedYouTubePlayerOptions = {
  playback: PlaybackState;
  serverClockOffsetMs: number;
  onDurationChange: (durationSeconds: number) => void;
  onEnded?: () => void;
  isSyncing?: boolean;
  onPlaybackReady?: (trackId: string) => void;
  isPreparing?: boolean;
  onPreparationReady?: (measurement: { startupMs: number; loadedSeconds: number }) => void;
  onPreparationError?: (message: string) => void;
};

function expectedPosition(playback: PlaybackState, serverNowMs: number): number {
  if (playback.status !== "playing" || playback.startsAtMs === null) return playback.positionSeconds;
  return playback.positionSeconds + Math.max(0, serverNowMs - playback.startsAtMs) / 1_000;
}

function getLoadedSeconds(player: YouTubePlayerState): number {
  const duration = player.getDuration();
  return duration > 0 ? duration * player.getVideoLoadedFraction() : 0;
}

function getRequiredLoadedSeconds(player: YouTubePlayerState): number {
  const duration = player.getDuration();
  return Math.min(2.5, Math.max(0.5, duration > 0 ? duration * 0.02 : 1));
}

export function useSyncedYouTubePlayer({ playback, serverClockOffsetMs, onDurationChange, onEnded, isSyncing, onPlaybackReady, isPreparing, onPreparationReady, onPreparationError }: UseSyncedYouTubePlayerOptions) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerState | null>(null);
  const playbackStatus = playback.status;
  const trackId = playback.trackId;
  const hasTrack = trackId !== null;
  const positionSeconds = playback.positionSeconds;
  const startsAtMs = playback.startsAtMs;
  const playbackRef = useRef<PlaybackState>(playback);
  const durationRef = useRef(0);
  const onEndedRef = useRef(onEnded);
  const onDurationChangeRef = useRef(onDurationChange);
  const onPlaybackReadyRef = useRef(onPlaybackReady);
  const onPreparationReadyRef = useRef(onPreparationReady);
  const onPreparationErrorRef = useRef(onPreparationError);
  const isPreparingRef = useRef(isPreparing);
  const isSyncingRef = useRef(isSyncing);
  const clockOffsetRef = useRef(serverClockOffsetMs);
  const warmupStartedAtRef = useRef<number | null>(null);
  const preparationReportedRef = useRef(false);
  const warmupCheckTimerRef = useRef<number | null>(null);
  const primedTrackIdRef = useRef<string | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const readyReportedRef = useRef<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [hasBegun, setHasBegun] = useState(false);
  const hasBegunRef = useRef(false);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  useEffect(() => { onDurationChangeRef.current = onDurationChange; }, [onDurationChange]);

  useEffect(() => { onPlaybackReadyRef.current = onPlaybackReady; }, [onPlaybackReady]);
  useEffect(() => { onPreparationReadyRef.current = onPreparationReady; }, [onPreparationReady]);
  useEffect(() => { onPreparationErrorRef.current = onPreparationError; }, [onPreparationError]);
  useEffect(() => { isPreparingRef.current = isPreparing; }, [isPreparing]);
  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);
  useEffect(() => { clockOffsetRef.current = serverClockOffsetMs; }, [serverClockOffsetMs]);

  useEffect(() => {
    playbackRef.current = { status: playbackStatus, mediaType: playback.mediaType, trackId, positionSeconds, startsAtMs };
  }, [playbackStatus, playback.mediaType, trackId, positionSeconds, startsAtMs]);

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayerState | null = null;

    void loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !mountRef.current || !trackId) return;
        preparationReportedRef.current = false;
        readyReportedRef.current = null;
        primedTrackIdRef.current = null;
        setPlayerError("");
        setAutoplayBlocked(false);
        loadedTrackIdRef.current = trackId;

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
              warmupStartedAtRef.current = performance.now();
              const duration = player?.getDuration() ?? 0;
              if (duration > 0) {
                durationRef.current = duration;
                onDurationChangeRef.current(duration);
              }
              const initialPlayback = playbackRef.current;
              if (initialPlayback.trackId && initialPlayback.trackId !== loadedTrackIdRef.current) {
                loadedTrackIdRef.current = initialPlayback.trackId;
                player?.cueVideoById({ videoId: initialPlayback.trackId, startSeconds: initialPlayback.positionSeconds });
              } else if (hasBegunRef.current && !isSyncingRef.current && initialPlayback.trackId) {
                // A muted play request makes YouTube fetch media; a cue alone only prepares metadata.
                player?.mute();
                const initialPosition = initialPlayback.status === "playing"
                  ? expectedPosition(initialPlayback, Date.now() + clockOffsetRef.current)
                  : initialPlayback.positionSeconds;
                player?.seekTo(initialPosition, true);
                player?.playVideo();
              }
              setPlayerReady(true);
            },
            onStateChange: (event) => {
              if (!hasBegunRef.current) return;
              // YouTube state 5 means the requested video has been cued and is ready for play.
              if (event.data === 5 && isSyncingRef.current) {
                player?.mute();
                player?.seekTo(playbackRef.current.positionSeconds, true);
                player?.playVideo();
              } else if (event.data === 5 && playbackRef.current.status !== "playing") {
                const activeTrack = playbackRef.current.trackId;
                if (activeTrack && readyReportedRef.current !== activeTrack) {
                  readyReportedRef.current = activeTrack;
                  onPlaybackReadyRef.current?.(activeTrack);
                }
              }
              const isWarming = isPreparingRef.current || isSyncingRef.current;
              if (event.data === 1 && isWarming && (isSyncingRef.current || !preparationReportedRef.current) && warmupCheckTimerRef.current === null) {
                const startedAt = warmupStartedAtRef.current ?? performance.now();
                const checkBufferedAmount = () => {
                  if (!player) return;
                  const loadedSeconds = getLoadedSeconds(player);
                  const elapsedMs = performance.now() - startedAt;
                  const enoughLoaded = loadedSeconds >= getRequiredLoadedSeconds(player);
                  if (enoughLoaded || elapsedMs >= 5_000) {
                    preparationReportedRef.current = true;
                    warmupCheckTimerRef.current = null;
                    const activeTrackId = playbackRef.current.trackId;
                    if (activeTrackId) primedTrackIdRef.current = activeTrackId;
                    if (isSyncingRef.current && activeTrackId) {
                      readyReportedRef.current = activeTrackId;
                      onPlaybackReadyRef.current?.(activeTrackId);
                    } else {
                      if (playbackRef.current.status !== "playing") player.pauseVideo();
                      onPreparationReadyRef.current?.({ startupMs: elapsedMs, loadedSeconds });
                    }
                    return;
                  }
                  warmupCheckTimerRef.current = window.setTimeout(checkBufferedAmount, 150);
                };
                checkBufferedAmount();
              }
              // Keep playback host-controlled if a player event starts audio unexpectedly.
              if (event.data === 1) {
                setAutoplayBlocked(false);
                if (playbackRef.current.status !== "playing" && !isPreparingRef.current && !isSyncingRef.current) window.setTimeout(() => player?.pauseVideo(), 100);
                if (playbackRef.current.status === "playing" && !isPreparingRef.current && !isSyncingRef.current) {
                  window.setTimeout(() => {
                    if (!player || player.getPlayerState() !== 1) return;
                    const target = expectedPosition(playbackRef.current, Date.now() + clockOffsetRef.current);
                    if (Math.abs(target - player.getCurrentTime()) > 2.5) player.seekTo(target, false);
                  }, 200);
                }
              } else if (event.data === 0) {
                onEndedRef.current?.();
              }
            },
            onError: (event) => {
              const message = event.data === 101 || event.data === 150
                ? "This video does not allow embedded playback. Open it on YouTube instead."
                : "YouTube could not play this video in the embedded player.";
              setPlayerError(message);
              onPreparationErrorRef.current?.(message);
            },
          },
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Could not load YouTube.";
        setPlayerError(message);
        onPreparationErrorRef.current?.(message);
      });

    return () => {
      cancelled = true;
      if (warmupCheckTimerRef.current !== null) window.clearTimeout(warmupCheckTimerRef.current);
      warmupCheckTimerRef.current = null;
      playerRef.current = null;
      setPlayerReady(false);
      player?.destroy();
    };
  }, [hasTrack]);

  // Waiting for a person's click must not count toward the buffering timeout.
  useEffect(() => {
    if (!hasBegun || !isPreparing) return;
    const timer = window.setTimeout(() => {
      if (!preparationReportedRef.current) {
        onPreparationErrorRef.current?.("The video player is taking too long to warm up. You can continue and try playback from the room.");
      }
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [hasBegun, isPreparing]);

  // Keep the IFrame instance alive across queue changes; recreating it can lose autoplay eligibility.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !trackId || trackId === loadedTrackIdRef.current) return;
    loadedTrackIdRef.current = trackId;
    primedTrackIdRef.current = null;
    preparationReportedRef.current = false;
    readyReportedRef.current = null;
    setAutoplayBlocked(false);
    setPlayerError("");
    warmupStartedAtRef.current = performance.now();
    if (!isSyncing) player.cueVideoById({ videoId: trackId, startSeconds: positionSeconds });
  }, [trackId, playerReady, isSyncing, positionSeconds]);

  // Apply the server's scheduled timeline whenever the host changes playback state.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !hasBegun) return;
    // The preparation screen owns the muted warm-up player until it is ready to reveal.
    if (isPreparing || isSyncing) return;

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
    player.unMute();
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
  }, [playerReady, hasBegun, isPreparing, isSyncing, playbackStatus, playback.mediaType, trackId, positionSeconds, startsAtMs, serverClockOffsetMs]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !hasBegun || !isSyncing || !trackId) return;
    readyReportedRef.current = null;
    const bufferReady = primedTrackIdRef.current === trackId && getLoadedSeconds(player) >= getRequiredLoadedSeconds(player);
    if (bufferReady && player.getPlayerState() === 1) {
      readyReportedRef.current = trackId;
      onPlaybackReadyRef.current?.(trackId);
      return;
    }
    preparationReportedRef.current = false;
    warmupStartedAtRef.current = performance.now();
    player.mute();
    if (bufferReady) {
      player.seekTo(positionSeconds, true);
      player.playVideo();
    } else {
      player.cueVideoById({ videoId: trackId, startSeconds: positionSeconds });
    }
  }, [isSyncing, playerReady, hasBegun, trackId, positionSeconds]);

  // Correct real playback drift, but never seek while YouTube is already buffering.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !hasBegun || isPreparing || isSyncing || playbackStatus !== "playing") return;

    const interval = window.setInterval(() => {
      const expected = expectedPosition(playbackRef.current, Date.now() + serverClockOffsetMs);
      const playerState = player.getPlayerState();
      if (playerState === 3) return;
      if (playerState !== 1) {
        player.playVideo();
        return;
      }
      // Never seek during buffering or force a new network request during background correction.
      if (Math.abs(expected - player.getCurrentTime()) > 2.5) player.seekTo(expected, false);
    }, 3_000);

    return () => window.clearInterval(interval);
  }, [playerReady, hasBegun, isPreparing, isSyncing, playbackStatus, serverClockOffsetMs]);

  useEffect(() => {
    if (!playerReady) return;
    const interval = window.setInterval(() => {
      const duration = playerRef.current?.getDuration() ?? 0;
      if (duration > 0 && Math.abs(duration - durationRef.current) > 1) {
        durationRef.current = duration;
        onDurationChangeRef.current(duration);
      }
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [onDurationChange, playerReady]);

  function resumePlayback() {
    const player = playerRef.current;
    if (!player) return;
    hasBegunRef.current = true;
    setHasBegun(true);
    warmupStartedAtRef.current = performance.now();
    player.seekTo(expectedPosition(playbackRef.current, Date.now() + clockOffsetRef.current), true);
    player.unMute();
    player.playVideo();
    setAutoplayBlocked(false);
  }

  return { mountRef, playerReady, playerError, autoplayBlocked, hasBegun, resumePlayback };
}
