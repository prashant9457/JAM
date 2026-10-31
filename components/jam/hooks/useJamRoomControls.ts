"use client";

import { useCallback } from "react";
import type { QueueItem } from "@/shared/jam";
import type { JamControlRequest } from "./useJamRoomSession";

type SendControl = (request: JamControlRequest) => void;

export function useJamRoomControls(sendControl: SendControl, isHost: boolean) {
  const setMediaType = useCallback((mediaType: "music" | "video") => {
    sendControl((socket, ack) => socket.timeout(8_000).emit("playback:set-media-type", { mediaType }, ack));
  }, [sendControl]);

  const addToQueue = useCallback((trackId: string, mediaType: QueueItem["mediaType"]) => {
    sendControl((socket, ack) => socket.timeout(8_000).emit("queue:add", { trackId, mediaType }, ack));
  }, [sendControl]);

  const moveQueueItem = useCallback((itemId: string, toIndex: number) => {
    sendControl((socket, ack) => socket.timeout(8_000).emit("queue:move", { itemId, toIndex }, ack));
  }, [sendControl]);

  const removeQueueItem = useCallback((itemId: string) => {
    sendControl((socket, ack) => socket.timeout(8_000).emit("queue:remove", { itemId }, ack));
  }, [sendControl]);

  const playQueueItem = useCallback((itemId: string) => {
    sendControl((socket, ack) => socket.timeout(8_000).emit("queue:play", { itemId }, ack));
  }, [sendControl]);

  const onTrackEnded = useCallback(() => {
    if (isHost) sendControl((socket, ack) => socket.timeout(8_000).emit("playback:ended", ack));
  }, [isHost, sendControl]);

  const togglePlayback = useCallback((isPlaying: boolean) => {
    sendControl((socket, ack) => isPlaying
      ? socket.timeout(8_000).emit("playback:pause", ack)
      : socket.timeout(8_000).emit("playback:play", ack));
  }, [sendControl]);

  return { setMediaType, addToQueue, moveQueueItem, removeQueueItem, playQueueItem, onTrackEnded, togglePlayback };
}
