"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiResult, RoomSnapshot } from "@/shared/jam";
import {
  createJamSocket,
  hostTokenStorageKey,
  synchronizeClock,
  type JamSocket,
} from "@/lib/realtime/client";
import { uploadMusicFile } from "@/lib/realtime/music-upload";
import type { UploadMusic } from "@/shared/music-upload";

export type ConnectionStatus =
  "connecting" | "connected" | "reconnecting" | "error";
type ControlAck = (
  error: Error | null,
  result: ApiResult<RoomSnapshot>,
) => void;
export type JamControlRequest = (socket: JamSocket, ack: ControlAck) => void;

export function useJamRoomSession(code: string) {
  const router = useRouter();
  const socketRef = useRef<JamSocket | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [selfParticipantId, setSelfParticipantId] = useState<string | null>(
    null,
  );
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [clockRoundTripMs, setClockRoundTripMs] = useState<number | null>(null);
  const [isClockSynced, setIsClockSynced] = useState(false);
  const [roomEnded, setRoomEnded] = useState(false);
  const [redirectSeconds, setRedirectSeconds] = useState(15);

  useEffect(() => {
    const socket = createJamSocket();
    socketRef.current = socket;

    function joinRoom() {
      setConnectionStatus("connecting");
      setIsClockSynced(false);
      setErrorMessage("");
      const hostToken =
        window.sessionStorage.getItem(hostTokenStorageKey(code)) ?? undefined;

      socket
        .timeout(8_000)
        .emit("room:join", { code, hostToken }, (timeoutError, result) => {
          if (timeoutError) {
            setConnectionStatus("error");
            setErrorMessage(
              "The room server did not respond. Check that it is running and reload.",
            );
            return;
          }
          if (!result.ok) {
            setConnectionStatus("error");
            setErrorMessage(result.error.message);
            return;
          }
          setRoom(result.data.room);
          setSelfParticipantId(result.data.selfParticipantId);
          setConnectionStatus("connected");
        });
    }

    function onState(nextRoom: RoomSnapshot) {
      setRoom(nextRoom);
    }

    function onRoomEnded(payload: { code: string }) {
      if (payload.code === code) setRoomEnded(true);
    }

    function onConnectError() {
      setConnectionStatus("reconnecting");
      setIsClockSynced(false);
    }

    function onDisconnect() {
      setConnectionStatus("reconnecting");
      setIsClockSynced(false);
    }

    function updateClockOffset() {
      void synchronizeClock(socket)
        .then(({ offsetMs, roundTripMs }) => {
          setServerClockOffsetMs(offsetMs);
          setClockRoundTripMs(roundTripMs);
          setIsClockSynced(true);
        })
        .catch(() => {
          // A transient clock-sync failure should not prevent joining the room.
        });
    }

    socket.on("connect", joinRoom);
    socket.on("room:state", onState);
    socket.on("room:ended", onRoomEnded);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.on("connect", updateClockOffset);
    socket.connect();
    const clockSyncInterval = window.setInterval(updateClockOffset, 30_000);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("room:state", onState);
      socket.off("room:ended", onRoomEnded);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
      socket.off("connect", updateClockOffset);
      window.clearInterval(clockSyncInterval);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code]);

  useEffect(() => {
    if (!roomEnded) return;
    const endsAt = Date.now() + 15_000;
    const timer = window.setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / 1_000));
      setRedirectSeconds(secondsLeft);
      if (secondsLeft === 0) {
        window.clearInterval(timer);
        router.replace("/");
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [roomEnded, router]);

  const sendControl = useCallback((request: JamControlRequest) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setErrorMessage("You are not connected to the room server.");
      return;
    }

    request(socket, (timeoutError, result) => {
      if (timeoutError) {
        setErrorMessage("The server did not respond to that control request.");
        return;
      }
      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }
      setErrorMessage("");
      setRoom(result.data);
    });
  }, []);

  const sendChatMessage = useCallback(
    async (text: string): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setErrorMessage("You are not connected to the room.");
        return false;
      }

      return new Promise((resolve) => {
        socket
          .timeout(8_000)
          .emit("chat:send", { text }, (timeoutError, result) => {
            if (timeoutError) {
              setErrorMessage(
                "The chat server did not respond. Try sending again.",
              );
              resolve(false);
              return;
            }
            if (!result.ok) {
              setErrorMessage(result.error.message);
              resolve(false);
              return;
            }
            setErrorMessage("");
            setRoom(result.data.room);
            resolve(true);
          });
      });
    },
    [],
  );

  const syncId = room?.sync?.id;
  const uploadMusic: UploadMusic = useCallback(
    async (file, onProgress, signal) => {
      const socket = socketRef.current;
      if (!socket?.connected)
        throw new Error("Reconnect to the room before uploading.");
      const nextRoom = await uploadMusicFile(socket, file, onProgress, signal);
      setRoom(nextRoom);
    },
    [],
  );
  const syncTrackId = room?.sync?.trackId;
  const reportPlaybackReady = useCallback(
    (trackId: string) => {
      const socket = socketRef.current;
      if (socket?.connected && syncTrackId === trackId && syncId)
        socket.emit("playback:ready", {
          trackId,
          roundTripMs: clockRoundTripMs ?? undefined,
          syncId,
        });
    },
    [clockRoundTripMs, syncId, syncTrackId],
  );

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      router.replace("/");
      return;
    }
    socket.timeout(2_000).emit("room:leave", () => {
      socket.disconnect();
      router.replace("/");
    });
  }, [router]);

  const isHost = Boolean(
    room?.participants.some(
      (participant) =>
        participant.id === selfParticipantId && participant.isHost,
    ),
  );

  return {
    room,
    selfParticipantId,
    connectionStatus,
    errorMessage,
    setErrorMessage,
    serverClockOffsetMs,
    clockRoundTripMs,
    isClockSynced,
    isHost,
    roomEnded,
    redirectSeconds,
    sendControl,
    uploadMusic,
    reportPlaybackReady,
    sendChatMessage,
    leaveRoom,
  };
}
