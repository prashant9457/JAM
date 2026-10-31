import { Server } from "socket.io";
import { RoomManager } from "./room-manager.ts";
import { isAllowedOrigin } from "./socket/guards.ts";
import { registerChatHandlers } from "./socket/chat-handlers.ts";
import { registerPlaybackHandlers } from "./socket/playback-handlers.ts";
import { registerRoomHandlers } from "./socket/room-handlers.ts";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "../shared/jam.ts";
import type { JamServer, SocketServices } from "./socket/types.ts";

/** Builds the Socket.IO server and wires its room, chat, and playback handlers. */
export function createJamSocketServer(origins: string[]) {
  const io: JamServer = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>({
    cors: {
      origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin, origins)),
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 1_000_000,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  const services: SocketServices = {
    io,
    rooms: new RoomManager(),
    eventTimes: new Map(),
    pendingHostEnds: new Map(),
  };

  // Enforce the configured origin policy for both WebSocket and polling handshakes.
  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (origin && !isAllowedOrigin(origin, origins)) {
      next(new Error("Origin is not allowed."));
      return;
    }
    next();
  });

  const cleanupTimer = setInterval(() => services.rooms.removeExpiredRooms(), 60_000);
  cleanupTimer.unref();

  io.on("connection", (socket) => {
    registerRoomHandlers(socket, services);
    registerChatHandlers(socket, services);
    registerPlaybackHandlers(socket, services);
  });

  return io;
}
