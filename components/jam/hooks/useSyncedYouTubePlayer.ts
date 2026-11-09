"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaybackState } from "@/shared/jam";
import {
  loadYouTubeIframeApi,
  type YouTubePlayerState,
} from "@/lib/youtube-iframe";
import {
  expectedPosition,
  playbackStartDelay,
  MAX_PLAYBACK_DRIFT_SECONDS,
} from "@/lib/playback-timing";

type UseSyncedYouTubePlayerOptions = {
  playback: PlaybackState;
  serverClockOffsetMs: number;
  onDurationChange: (durationSeconds: number) => void;
  onEnded?: () => void;
  isSyncing?: boolean;
  onPlaybackReady?: (trackId: string) => void;
  isPreparing?: boolean;
  onPreparationReady?: (measurement: {
    startupMs: number;
    loadedSeconds: number;
  }) => void;
  onPreparationError?: (message: string) => void;
};

function getLoadedSeconds(player: YouTubePlayerState): number {
  const duration = player.getDuration();
  return duration > 0 ? duration * player.getVideoLoadedFraction() : 0;
}

function getRequiredLoadedSeconds(player: YouTubePlayerState): number {
  const duration = player.getDuration();
  return Math.min(2.5, Math.max(0.5, duration > 0 ? duration * 0.02 : 1));
}

export function useSyncedYouTubePlayer({
  playback,
  serverClockOffsetMs,
  onDurationChange,
  onEnded,
  isSyncing,
  onPlaybackReady,
  isPreparing,
  onPreparationReady,
  onPreparationError,
}: UseSyncedYouTubePlayerOptions) {
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
  useEffect(() => {
    onDurationChangeRef.current = onDurationChange;
  }, [onDurationChange]);

  useEffect(() => {
    onPlaybackReadyRef.current = onPlaybackReady;
  }, [onPlaybackReady]);
  useEffect(() => {
    onPreparationReadyRef.current = onPreparationReady;
  }, [onPreparationReady]);
  useEffect(() => {
    onPreparationErrorRef.current = onPreparationError;
  }, [onPreparationError]);
  useEffect(() => {
    isPreparingRef.current = isPreparing;
  }, [isPreparing]);
  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);
  useEffect(() => {
    clockOffsetRef.current = serverClockOffsetMs;
  }, [serverClockOffsetMs]);

  useEffect(() => {
    playbackRef.current = {
      status: playbackStatus,
      mediaType: playback.mediaType,
      trackId,
      positionSeconds,
      startsAtMs,
    };
  }, [
    playbackStatus,
    playback.mediaType,
    trackId,
    positionSeconds,
    startsAtMs,
  ]);

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayerState | null = null;

    void loadYouTubeIframeApi()
      .then((youtube) => {
        const initialTrackId = playbackRef.current.trackId;
        if (cancelled || !mountRef.current || !initialTrackId) return;
        preparationReportedRef.current = false;
        readyReportedRef.current = null;
        primedTrackIdRef.current = null;
        setPlayerError("");
        setAutoplayBlocked(false);
        loadedTrackIdRef.current = initialTrackId;

        player = new youtube.Player(mountRef.current, {
          videoId: initialTrackId,
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
              if (
                initialPlayback.trackId &&
                initialPlayback.trackId !== loadedTrackIdRef.current
              ) {
                loadedTrackIdRef.current = initialPlayback.trackId;
                player?.cueVideoById({
                  videoId: initialPlayback.trackId,
                  startSeconds: initialPlayback.positionSeconds,
                });
              } else if (
                hasBegunRef.current &&
                !isSyncingRef.current &&
                initialPlayback.trackId
              ) {
                // A muted play request makes YouTube fetch media; a cue alone only prepares metadata.
                player?.mute();
                const initialPosition =
                  initialPlayback.status === "playing"
                    ? expectedPosition(
                        initialPlayback,
                        Date.now() + clockOffsetRef.current,
                      )
                    : initialPlayback.positionSeconds;
                player?.seekTo(initialPosition, true);
                player?.playVideo();
              }
              setPlayerReady(true);
            },
            onStateChange: (event) => {
              if (!hasBegunRef.current) return;
              const isWarming = isPreparingRef.current || isSyncingRef.current;
              if (
                event.data === 1 &&
                isWarming &&
                (isSyncingRef.current || !preparationReportedRef.current) &&
                warmupCheckTimerRef.current === null
              ) {
                const startedAt =
                  warmupStartedAtRef.current ?? performance.now();
                const checkBufferedAmount = () => {
                  if (!player) return;
                  const loadedSeconds = getLoadedSeconds(player);
                  const elapsedMs = performance.now() - startedAt;
                  const enoughLoaded =
                    loadedSeconds >= getRequiredLoadedSeconds(player);
                  if (enoughLoaded || elapsedMs >= 5_000) {
                    preparationReportedRef.current = true;
                    warmupCheckTimerRef.current = null;
                    const activeTrackId = playbackRef.current.trackId;
                    if (activeTrackId) primedTrackIdRef.current = activeTrackId;
                    // Local preparation and shared readiness are separate gates.
                    // A joining client can be preparing while the room is syncing.
                    onPreparationReadyRef.current?.({
                      startupMs: elapsedMs,
                      loadedSeconds,
                    });
                    if (playbackRef.current.status !== "playing")
                      player.pauseVideo();
                    return;
                  }
                  warmupCheckTimerRef.current = window.setTimeout(
                    checkBufferedAmount,
                    150,
                  );
                };
                checkBufferedAmount();
              }
              // Keep playback host-controlled if a player event starts audio unexpectedly.
              if (event.data === 1) {
                setAutoplayBlocked(false);
                if (
                  playbackRef.current.status !== "playing" &&
                  !isPreparingRef.current &&
                  !isSyncingRef.current
                )
                  window.setTimeout(() => player?.pauseVideo(), 100);
                if (
                  playbackRef.current.status === "playing" &&
                  !isPreparingRef.current &&
                  !isSyncingRef.current
                ) {
                  window.setTimeout(() => {
                    if (!player || player.getPlayerState() !== 1) return;
                    const target = expectedPosition(
                      playbackRef.current,
                      Date.now() + clockOffsetRef.current,
                    );
                    if (
                      Math.abs(target - player.getCurrentTime()) >
                      MAX_PLAYBACK_DRIFT_SECONDS
                    )
                      player.seekTo(target, true);
                  }, 200);
                }
              } else if (event.data === 0) {
                onEndedRef.current?.();
              }
            },
            onAutoplayBlocked: () => {
              if (!cancelled) setAutoplayBlocked(true);
            },
            onError: (event) => {
              const explanations: Record<number, string> = {
                2: "YouTube received an invalid video ID or player parameter.",
                5: "YouTube could not play this video in the HTML5 player. Try reloading or another browser.",
                100: "This video is unavailable, private, or has been removed.",
                101: "The video owner does not allow embedded playback. Choose another video or open it on YouTube.",
                150: "The video owner does not allow embedded playback. Choose another video or open it on YouTube.",
                153: "YouTube could not identify this website because the request is missing its referrer or client identification. Check the site's referrer policy and browser privacy extensions.",
              };
              const message = `${explanations[event.data] ?? "YouTube could not play this video in the embedded player."} (YouTube error ${event.data})`;
              setPlayerError(message);
              onPreparationErrorRef.current?.(message);
            },
          },
        });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Could not load YouTube.";
        setPlayerError(message);
        onPreparationErrorRef.current?.(message);
      });

    return () => {
      cancelled = true;
      if (warmupCheckTimerRef.current !== null)
        window.clearTimeout(warmupCheckTimerRef.current);
      warmupCheckTimerRef.current = null;
      playerRef.current = null;
      setPlayerReady(false);
      player?.destroy();
    };
  }, [hasTrack]);

  // Waiting for a person's click must not count toward the buffering timeout.
  useEffect(() => {
    if (!hasTrack || !isPreparing) return;
    const timer = window.setTimeout(() => {
      if (!playerRef.current) {
        const message =
          "YouTube did not finish loading. Try again or continue to the room.";
        setPlayerError(message);
        onPreparationErrorRef.current?.(message);
      } else if (hasBegun && !preparationReportedRef.current) {
        onPreparationErrorRef.current?.(
          "The video player is taking too long to warm up. You can continue and try playback from the room.",
        );
      }
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [hasTrack, hasBegun, isPreparing]);

  // Keep the IFrame instance alive across queue changes; recreating it can lose autoplay eligibility.
  useEffect(() => {
    const player = playerRef.current;
    if (
      !player ||
      !playerReady ||
      !trackId ||
      trackId === loadedTrackIdRef.current
    )
      return;
    loadedTrackIdRef.current = trackId;
    primedTrackIdRef.current = null;
    preparationReportedRef.current = false;
    readyReportedRef.current = null;
    setAutoplayBlocked(false);
    setPlayerError("");
    warmupStartedAtRef.current = performance.now();
    if (!isSyncing)
      player.cueVideoById({ videoId: trackId, startSeconds: positionSeconds });
  }, [trackId, playerReady, isSyncing, positionSeconds]);

  // Apply the server's scheduled timeline whenever the host changes playback state.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !hasBegun) return;
    // The preparation screen owns the muted warm-up player until it is ready to reveal.
    if (isPreparing || isSyncing) return;

    const currentPlayback: PlaybackState = {
      status: playbackStatus,
      mediaType: playback.mediaType,
      trackId,
      positionSeconds,
      startsAtMs,
    };
    if (playbackStatus !== "playing") {
      player.pauseVideo();
      if (Math.abs(player.getCurrentTime() - positionSeconds) > 1.25)
        player.seekTo(positionSeconds, true);
      return;
    }

    const delayMs = playbackStartDelay(
      startsAtMs,
      Date.now(),
      serverClockOffsetMs,
    );
    const nowPosition = expectedPosition(
      currentPlayback,
      Date.now() + serverClockOffsetMs,
    );

    player.pauseVideo();
    player.mute();
    player.seekTo(delayMs > 50 ? positionSeconds : nowPosition, true);
    player.pauseVideo();

    const playTimer = window.setTimeout(() => {
      const target = expectedPosition(
        currentPlayback,
        Date.now() + serverClockOffsetMs,
      );
      if (
        Math.abs(target - player.getCurrentTime()) > MAX_PLAYBACK_DRIFT_SECONDS
      )
        player.seekTo(target, true);
      player.unMute();
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
  }, [
    playerReady,
    hasBegun,
    isPreparing,
    isSyncing,
    playbackStatus,
    playback.mediaType,
    trackId,
    positionSeconds,
    startsAtMs,
    serverClockOffsetMs,
  ]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !isSyncing || !trackId) return;
    readyReportedRef.current = null;
    preparationReportedRef.current = false;
    warmupStartedAtRef.current = performance.now();
    player.pauseVideo();
    player.mute();
    player.cueVideoById({ videoId: trackId, startSeconds: positionSeconds });
    // Cued/buffered is not consent. Only the Begin button reports readiness.
  }, [isSyncing, playerReady, trackId, positionSeconds]);

  // Correct real playback drift, but never seek while YouTube is already buffering.
  useEffect(() => {
    const player = playerRef.current;
    if (
      !player ||
      !playerReady ||
      !hasBegun ||
      isPreparing ||
      isSyncing ||
      playbackStatus !== "playing"
    )
      return;

    const interval = window.setInterval(() => {
      const expected = expectedPosition(
        playbackRef.current,
        Date.now() + serverClockOffsetMs,
      );
      const scheduledStart = playbackRef.current.startsAtMs;
      if (
        scheduledStart !== null &&
        Date.now() + serverClockOffsetMs < scheduledStart
      )
        return;
      const playerState = player.getPlayerState();
      if (playerState === 3) return;
      if (playerState !== 1) {
        if (
          Math.abs(expected - player.getCurrentTime()) >
          MAX_PLAYBACK_DRIFT_SECONDS
        )
          player.seekTo(expected, true);
        player.playVideo();
        return;
      }
      // Never seek during buffering or force a new network request during background correction.
      if (
        Math.abs(expected - player.getCurrentTime()) >
        MAX_PLAYBACK_DRIFT_SECONDS
      )
        player.seekTo(expected, false);
    }, 750);

    return () => window.clearInterval(interval);
  }, [
    playerReady,
    hasBegun,
    isPreparing,
    isSyncing,
    playbackStatus,
    serverClockOffsetMs,
  ]);

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
    if (isSyncingRef.current) {
      // Unlock this browser from a real gesture, silently, while everyone taps.
      player.mute();
    } else {
      player.seekTo(
        expectedPosition(
          playbackRef.current,
          Date.now() + clockOffsetRef.current,
        ),
        true,
      );
      player.unMute();
    }
    player.playVideo();
    const activeTrackId = playbackRef.current.trackId;
    if (isSyncingRef.current && activeTrackId) {
      readyReportedRef.current = activeTrackId;
      onPlaybackReadyRef.current?.(activeTrackId);
    }
    preparationReportedRef.current = true;
    onPreparationReadyRef.current?.({
      startupMs: 0,
      loadedSeconds: getLoadedSeconds(player),
    });
    setAutoplayBlocked(false);
  }

  return {
    mountRef,
    playerReady,
    playerError,
    autoplayBlocked,
    hasBegun,
    resumePlayback,
  };
}
