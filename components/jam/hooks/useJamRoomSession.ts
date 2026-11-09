"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiResult, RoomSnapshot } from "@/shared/jam";
import {
  createJamSocket,
  getParticipantToken,
  hostTokenStorageKey,
  synchronizeClock,
  type JamSocket,
} from "@/lib/realtime/client";
import { uploadMusicFile } from "@/lib/realtime/music-upload";
import type { UploadMusic } from "@/shared/music-upload";
import { selectRoomSnapshot } from "@/lib/realtime/room-snapshot";

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
  const acceptRoom = useCallback(
    (nextRoom: RoomSnapshot) => {
      setRoom((current) => selectRoomSnapshot(current, nextRoom, code));
    },
    [code],
  );

  useEffect(() => {
    const socket = createJamSocket();
    socketRef.current = socket;
    let disposed = false;
    let generation = 0;
    let clockInFlight = false;
    let replaced = false;

    function joinRoom() {
      if (disposed) return;
      const joinedGeneration = ++generation;
      setConnectionStatus("connecting");
      setIsClockSynced(false);
      setErrorMessage("");
      const hostToken =
        window.sessionStorage.getItem(hostTokenStorageKey(code)) ?? undefined;
      const participantToken = getParticipantToken(code);

      socket
        .timeout(8_000)
        .emit(
          "room:join",
          { code, hostToken, participantToken },
          (timeoutError, result) => {
            if (
              disposed ||
              generation !== joinedGeneration ||
              !socket.connected
            )
              return;
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
            acceptRoom(result.data.room);
            setSelfParticipantId(result.data.selfParticipantId);
            setConnectionStatus("connected");
          },
        );
    }

    function onState(nextRoom: RoomSnapshot) {
      if (!disposed && !replaced) acceptRoom(nextRoom);
    }

    function onRoomEnded(payload: { code: string }) {
      if (payload.code === code) setRoomEnded(true);
    }

    function onConnectError() {
      if (disposed || replaced) return;
      setConnectionStatus("reconnecting");
      setIsClockSynced(false);
    }

    function onDisconnect() {
      if (disposed) return;
      generation++;
      clockInFlight = false;
      setConnectionStatus(replaced ? "error" : "reconnecting");
      setIsClockSynced(false);
    }

    function onSessionReplaced() {
      replaced = true;
      setSelfParticipantId(null);
      setIsClockSynced(false);
      setConnectionStatus("error");
      setErrorMessage(
        "This session was opened in another tab. Reload to join here again.",
      );
    }

    function updateClockOffset() {
      if (disposed || replaced || !socket.connected || clockInFlight) return;
      clockInFlight = true;
      const clockGeneration = generation;
      void synchronizeClock(socket)
        .then(({ offsetMs, roundTripMs }) => {
          if (disposed || generation !== clockGeneration || !socket.connected)
            return;
          setServerClockOffsetMs(offsetMs);
          setClockRoundTripMs(roundTripMs);
          setIsClockSynced(true);
        })
        .catch(() => {
          // A transient clock-sync failure should not prevent joining the room.
        })
        .finally(() => {
          if (generation === clockGeneration) clockInFlight = false;
        });
    }

    socket.on("connect", joinRoom);
    socket.on("room:state", onState);
    socket.on("room:ended", onRoomEnded);
    socket.on("room:session-replaced", onSessionReplaced);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.on("connect", updateClockOffset);
    socket.connect();
    const clockSyncInterval = window.setInterval(updateClockOffset, 30_000);

    return () => {
      disposed = true;
      generation++;
      socket.off("connect", joinRoom);
      socket.off("room:state", onState);
      socket.off("room:ended", onRoomEnded);
      socket.off("room:session-replaced", onSessionReplaced);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
      socket.off("connect", updateClockOffset);
      window.clearInterval(clockSyncInterval);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, acceptRoom]);

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

  const sendControl = useCallback(
    (request: JamControlRequest) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setErrorMessage("You are not connected to the room server.");
        return;
      }

      const connectionId = socket.id;
      request(socket, (timeoutError, result) => {
        if (socketRef.current !== socket || socket.id !== connectionId) return;
        if (timeoutError) {
          setErrorMessage(
            "The server did not respond to that control request.",
          );
          return;
        }
        if (!result.ok) {
          setErrorMessage(result.error.message);
          return;
        }
        setErrorMessage("");
        acceptRoom(result.data);
      });
    },
    [acceptRoom],
  );

  const sendChatMessage = useCallback(
    async (text: string): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setErrorMessage("You are not connected to the room.");
        return false;
      }

      return new Promise((resolve) => {
        const connectionId = socket.id;
        socket
          .timeout(8_000)
          .emit("chat:send", { text }, (timeoutError, result) => {
            if (socketRef.current !== socket || socket.id !== connectionId) {
              resolve(false);
              return;
            }
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
            acceptRoom(result.data.room);
            resolve(true);
          });
      });
    },
    [acceptRoom],
  );

  const syncId = room?.sync?.id;
  const uploadMusic: UploadMusic = useCallback(
    async (file, onProgress, signal) => {
      const socket = socketRef.current;
      if (!socket?.connected)
        throw new Error("Reconnect to the room before uploading.");
      const nextRoom = await uploadMusicFile(socket, file, onProgress, signal);
      if (socketRef.current !== socket || !socket.connected)
        throw new Error(
          "The room connection changed during the upload. Rejoin to see its status.",
        );
      acceptRoom(nextRoom);
    },
    [acceptRoom],
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
