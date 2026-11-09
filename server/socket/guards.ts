import type {
  ApiErrorCode,
  ApiResult,
  RoomSnapshot,
} from "../../shared/jam.ts";
import { RoomError } from "../room-manager.ts";
import type { Ack, EventTimes, JamSocket, SocketServices } from "./types.ts";

const MAX_EVENTS_PER_WINDOW = 80;
const EVENT_WINDOW_MS = 10_000;

/** Permit explicitly configured origins plus loopback/private LAN origins for local testing. */
export function isAllowedOrigin(
  origin: string,
  configuredOrigins: string[],
): boolean {
  if (configuredOrigins.includes(origin)) return true;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }

  if (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname.startsWith("127.")
  )
    return true;
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  )
    return false;

  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

export function allowEvent<T>(
  socket: JamSocket,
  eventTimes: EventTimes,
  ack: Ack<T>,
): boolean {
  if (typeof ack !== "function") return false;
  const now = Date.now();
  const recent = (eventTimes.get(socket.id) ?? []).filter(
    (time) => now - time < EVENT_WINDOW_MS,
  );
  if (recent.length >= MAX_EVENTS_PER_WINDOW) {
    eventTimes.set(socket.id, recent);
    ack({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please wait a moment.",
      },
    });
    return false;
  }
  recent.push(now);
  eventTimes.set(socket.id, recent);
  return true;
}

export function failure<T>(error: unknown): ApiResult<T> {
  if (error instanceof RoomError)
    return { ok: false, error: { code: error.code, message: error.message } };
  console.error("Unhandled Jam server error:", error);
  const code: ApiErrorCode = "INTERNAL_ERROR";
  return {
    ok: false,
    error: { code, message: "The server could not complete that request." },
  };
}

export function runHostCommand(
  socket: JamSocket,
  services: Pick<SocketServices, "io" | "rooms" | "eventTimes">,
  ack: Ack<RoomSnapshot>,
  command: (code: string, participantId: string) => RoomSnapshot,
) {
  if (!allowEvent(socket, services.eventTimes, ack)) return;
  try {
    const { roomCode, participantId } = socket.data;
    if (!roomCode || !participantId)
      throw new RoomError("NOT_IN_ROOM", "Join a room first.");
    const room = command(roomCode, participantId);
    ack({ ok: true, data: room });
    services.io.to(roomCode).emit("room:state", room);
  } catch (error) {
    ack(failure(error));
  }
}

export function leaveCurrentRoom(
  socket: JamSocket,
  services: Pick<SocketServices, "io" | "rooms" | "pendingHostEnds">,
  deferDisconnectEnd = false,
) {
  const { io, rooms, pendingHostEnds } = services;
  const code = socket.data.roomCode;
  if (!code) return;

  if (socket.data.isHost && deferDisconnectEnd) {
    const snapshot = rooms.leaveRoom(code, socket.id);
    if (snapshot) io.to(code).emit("room:state", snapshot);
    const oldTimer = pendingHostEnds.get(code);
    if (oldTimer) clearTimeout(oldTimer);
    const timer = setTimeout(() => {
      pendingHostEnds.delete(code);
      if (!rooms.hasConnectedHost(code) && rooms.endRoomByCode(code))
        io.to(code).emit("room:ended", { code });
    }, 5_000);
    timer.unref();
    pendingHostEnds.set(code, timer);
  } else if (socket.data.isHost) {
    const pendingEnd = pendingHostEnds.get(code);
    if (pendingEnd) clearTimeout(pendingEnd);
    pendingHostEnds.delete(code);
    if (rooms.endRoom(code, socket.id))
      io.to(code).emit("room:ended", { code });
  } else {
    const snapshot = rooms.leaveRoom(code, socket.id);
    if (snapshot) io.to(code).emit("room:state", snapshot);
  }

  socket.leave(code);
  socket.data.roomCode = undefined;
  socket.data.participantId = undefined;
  socket.data.isHost = false;
}
