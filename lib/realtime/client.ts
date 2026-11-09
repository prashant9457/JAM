"use client";

import { io, type Socket } from "socket.io-client";
import type {
  ApiResult,
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/shared/jam";
import { clockMeasurement, clockNow, ClockSampleWindow } from "./clock";

export type JamSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Create a browser socket on demand so server rendering never opens a connection. */
export function getJamServerUrl(): string {
  // Reuse the page hostname so a phone on the same LAN reaches the host computer.
  const defaultUrl = `${window.location.protocol}//${window.location.hostname}:4000`;
  return (process.env.NEXT_PUBLIC_JAM_SERVER_URL || defaultUrl).replace(
    /\/$/,
    "",
  );
}

export function createJamSocket(): JamSocket {
  return io(getJamServerUrl(), {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 8,
    timeout: 8_000,
  });
}

export function hostTokenStorageKey(roomCode: string): string {
  return `jam:host:${roomCode}`;
}

export function participantTokenStorageKey(roomCode: string): string {
  return `jam:participant:${roomCode}`;
}

export function getParticipantToken(roomCode: string): string {
  const key = participantTokenStorageKey(roomCode);
  let token = window.sessionStorage.getItem(key);
  if (!token) {
    token = Array.from(
      window.crypto.getRandomValues(new Uint8Array(32)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    window.sessionStorage.setItem(key, token);
  }
  return token;
}

export function waitForSocketConnection(socket: JamSocket): Promise<void> {
  if (socket.connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error("The Jam server did not respond.")),
      10_000,
    );

    function cleanup() {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
    }

    function finish(error?: Error) {
      cleanup();
      if (error) reject(error);
      else resolve();
    }

    function onConnect() {
      finish();
    }

    function onError(error: Error) {
      finish(error);
    }

    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
    socket.connect();
  });
}

export type ClockSyncResult = { offsetMs: number; roundTripMs: number };
const clockWindows = new WeakMap<
  JamSocket,
  { connectionId: string | undefined; window: ClockSampleWindow }
>();

function measureClockOffset(socket: JamSocket): Promise<ClockSyncResult> {
  if (!socket.connected)
    return Promise.reject(new Error("Socket is not connected."));

  const clientSentAtMs = clockNow();
  return new Promise((resolve, reject) => {
    socket.timeout(5_000).emit(
      "clock:sync",
      { clientSentAtMs },
      (
        timeoutError: Error | null,
        result: ApiResult<{
          clientSentAtMs: number;
          serverTimeMs: number;
          serverReceivedAtMs?: number;
          serverSentAtMs?: number;
        }>,
      ) => {
        const clientReceivedAtMs = clockNow();
        if (timeoutError) {
          reject(new Error("Could not synchronize with the room clock."));
          return;
        }
        if (!result.ok) {
          reject(new Error(result.error.message));
          return;
        }

        resolve(
          clockMeasurement(
            clientSentAtMs,
            result.data.serverReceivedAtMs ?? result.data.serverTimeMs,
            result.data.serverSentAtMs ?? result.data.serverTimeMs,
            clientReceivedAtMs,
          ),
        );
      },
    );
  });
}

/** Estimate server time from several probes and select the least delayed sample. */
export async function synchronizeClock(
  socket: JamSocket,
): Promise<ClockSyncResult> {
  const connectionId = socket.id;
  const measurements = await Promise.allSettled(
    Array.from({ length: 10 }, () => measureClockOffset(socket)),
  );
  const successful = measurements
    .filter(
      (result): result is PromiseFulfilledResult<ClockSyncResult> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
  if (successful.length === 0)
    throw new Error("Could not synchronize with the room clock.");
  if (!socket.connected || socket.id !== connectionId)
    throw new Error(
      "The room connection changed during clock synchronization.",
    );
  let samples = clockWindows.get(socket);
  if (!samples || samples.connectionId !== connectionId) {
    samples = { connectionId, window: new ClockSampleWindow() };
    clockWindows.set(socket, samples);
  }
  return samples.window.add(successful);
}
