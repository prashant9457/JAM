"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackState } from "@/shared/jam";
import { getMusicTrack, type MusicTrack } from "@/shared/music";
import { getJamServerUrl } from "@/lib/realtime/client";
import { MusicAudioEngine } from "@/lib/music-audio";
import { clockNow } from "@/lib/realtime/clock";

type Options = {
  musicTracks: readonly MusicTrack[];
  playback: PlaybackState;
  serverClockOffsetMs: number;
  isClockSynced: boolean;
  isSyncing: boolean;
  onPlaybackReady: (trackId: string) => void;
  onDurationChange: (seconds: number) => void;
  onEnded?: () => void;
};

export function useSyncedMusicPlayer({
  musicTracks,
  playback,
  serverClockOffsetMs,
  isClockSynced,
  isSyncing,
  onPlaybackReady,
  onDurationChange,
  onEnded,
}: Options) {
  const engineRef = useRef<MusicAudioEngine | null>(null);
  const onEndedRef = useRef(onEnded);
  const playbackRef = useRef(playback);
  const offsetRef = useRef(serverClockOffsetMs);
  const [enabled, setEnabled] = useState(false);
  const [loadedAudio, setLoadedAudio] = useState<{
    trackId: string;
    buffer: AudioBuffer;
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const track = getMusicTrack(playback.trackId, musicTracks);
  const trackId = track?.id;
  const sourceUrl = track?.src;
  const buffer =
    loadedAudio?.trackId === track?.id ? (loadedAudio?.buffer ?? null) : null;
  const loaded = buffer !== null;

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  useEffect(() => {
    playbackRef.current = playback;
    offsetRef.current = serverClockOffsetMs;
  }, [playback, serverClockOffsetMs]);

  useEffect(() => {
    let engine: MusicAudioEngine | null = null;
    let disposed = false;
    const resumeFromInteraction = () => {
      if (!engine || engine.context.state === "closed") return;
      void engine.context
        .resume()
        .then(() => {
          if (!disposed) setEnabled(engine?.context.state === "running");
        })
        .catch(() => {
          /* The in-room Enable audio button remains the fallback. */
        });
    };
    try {
      engine = new MusicAudioEngine(
        new AudioContext({ latencyHint: "playback" }),
      );
      engineRef.current = engine;
      engine.context.onstatechange = () =>
        setEnabled(engine?.context.state === "running");
      // Reuse ordinary in-room interactions instead of requiring a second Play click.
      window.addEventListener("pointerdown", resumeFromInteraction, true);
      window.addEventListener("keydown", resumeFromInteraction, true);
      resumeFromInteraction();
    } catch {
      // Report asynchronously so rendering remains independent of audio initialization.
      queueMicrotask(() =>
        setError(
          "This browser could not initialize audio. Use a current browser and try again.",
        ),
      );
    }
    return () => {
      disposed = true;
      window.removeEventListener("pointerdown", resumeFromInteraction, true);
      window.removeEventListener("keydown", resumeFromInteraction, true);
      engineRef.current = null;
      if (engine) {
        engine.context.onstatechange = null;
        void engine.close();
      }
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !trackId || !sourceUrl) return;
    const controller = new AbortController();
    engine.stop();
    void engine
      .load(
        sourceUrl.startsWith("/music/uploads/")
          ? `${getJamServerUrl()}${sourceUrl}`
          : sourceUrl,
        controller.signal,
      )
      .then((buffer) => {
        if (controller.signal.aborted) return;
        setError("");
        setLoadedAudio({ trackId, buffer });
        onDurationChange(buffer.duration);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load this track.",
          );
      });
    return () => {
      controller.abort();
      engine.stop();
    };
  }, [trackId, sourceUrl, retry, onDurationChange]);

  useEffect(() => {
    if (isSyncing && enabled && loaded && isClockSynced && trackId && !error)
      onPlaybackReady(trackId);
  }, [
    isSyncing,
    enabled,
    loaded,
    isClockSynced,
    trackId,
    error,
    onPlaybackReady,
  ]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (
      !enabled ||
      !loaded ||
      !buffer ||
      !isClockSynced ||
      isSyncing ||
      playback.status !== "playing"
    ) {
      engine.stop();
      return;
    }
    engine.synchronize(buffer, playback, serverClockOffsetMs, clockNow(), () =>
      onEndedRef.current?.(),
    );
    // Re-anchor only for timeline changes, never for chat or participant updates.
    const correction = window.setInterval(() => {
      if (
        playbackRef.current.startsAtMs !== null &&
        clockNow() + offsetRef.current < playbackRef.current.startsAtMs
      )
        return;
      engine.reconcile(
        buffer,
        playbackRef.current,
        offsetRef.current,
        clockNow(),
        () => onEndedRef.current?.(),
      );
    }, 2_000);
    return () => {
      window.clearInterval(correction);
      // Clock refreshes replace this timer, not the already-running audio source.
    };
    // The scalar dependencies below intentionally exclude snapshot object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    loaded,
    buffer,
    isClockSynced,
    isSyncing,
    playback.status,
    playback.trackId,
    playback.positionSeconds,
    playback.startsAtMs,
    serverClockOffsetMs,
  ]);

  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  const enableAudio = useCallback(() => {
    const context = engineRef.current?.context;
    if (!context) return;
    // Resume synchronously from the click; downloading never consumes the gesture.
    void context
      .resume()
      .then(() => {
        setEnabled(context.state === "running");
        setError("");
      })
      .catch(() =>
        setError("Audio is blocked by this browser. Tap Enable audio again."),
      );
  }, []);

  function retryLoad() {
    setError("");
    setLoadedAudio(null);
    setRetry((value) => value + 1);
  }
  return { enabled, loaded, error, volume, setVolume, enableAudio, retryLoad };
}
