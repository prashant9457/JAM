"use client";

import { io, type Socket } from "socket.io-client";
import type { ApiResult, ClientToServerEvents, ServerToClientEvents } from "@/shared/jam";

export type JamSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Create a browser socket on demand so server rendering never opens a connection. */
export function createJamSocket(): JamSocket {
  // Reuse the page hostname so a phone on the same LAN reaches the host computer.
  const defaultUrl = `${window.location.protocol}//${window.location.hostname}:4000`;
  const url = process.env.NEXT_PUBLIC_JAM_SERVER_URL || defaultUrl;
  return io(url, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 8,
    timeout: 8_000,
  });
}

export function hostTokenStorageKey(roomCode: string): string {
  return `jam:host:${roomCode}`;
}

export function waitForSocketConnection(socket: JamSocket): Promise<void> {
  if (socket.connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("The Jam server did not respond.")), 10_000);

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

function measureClockOffset(socket: JamSocket): Promise<ClockSyncResult> {
  if (!socket.connected) return Promise.reject(new Error("Socket is not connected."));

  const clientSentAtMs = Date.now();
  return new Promise((resolve, reject) => {
    socket.timeout(5_000).emit(
      "clock:sync",
      { clientSentAtMs },
      (
        timeoutError: Error | null,
        result: ApiResult<{ clientSentAtMs: number; serverTimeMs: number }>,
      ) => {
        const clientReceivedAtMs = Date.now();
        if (timeoutError) {
          reject(new Error("Could not synchronize with the room clock."));
          return;
        }
        if (!result.ok) {
          reject(new Error(result.error.message));
          return;
        }

        const clientMidpoint = (clientSentAtMs + clientReceivedAtMs) / 2;
        resolve({
          offsetMs: result.data.serverTimeMs - clientMidpoint,
          roundTripMs: clientReceivedAtMs - clientSentAtMs,
        });
      },
    );
  });
}

/** Estimate server time from several probes and select the least delayed sample. */
export async function synchronizeClock(socket: JamSocket): Promise<ClockSyncResult> {
  const measurements = await Promise.allSettled(Array.from({ length: 5 }, () => measureClockOffset(socket)));
  const successful = measurements
    .filter((result): result is PromiseFulfilledResult<ClockSyncResult> => result.status === "fulfilled")
    .map((result) => result.value);
  if (successful.length === 0) throw new Error("Could not synchronize with the room clock.");
  return successful.reduce((best, sample) => sample.roundTripMs < best.roundTripMs ? sample : best);
}
