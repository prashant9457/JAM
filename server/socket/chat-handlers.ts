import { RoomError } from "../room-manager.ts";
import { allowEvent, failure } from "./guards.ts";
import type { JamSocket, SocketServices } from "./types.ts";

export function registerChatHandlers(socket: JamSocket, services: SocketServices) {
  socket.on("chat:send", (payload, ack) => {
    if (!allowEvent(socket, services.eventTimes, ack)) return;
    try {
      const { roomCode, participantId } = socket.data;
      if (!roomCode || !participantId) throw new RoomError("NOT_IN_ROOM", "Join a room before sending a message.");
      const room = services.rooms.sendMessage(roomCode, participantId, payload?.text);
      ack({ ok: true, data: { room } });
      services.io.to(roomCode).emit("room:state", room);
    } catch (error) {
      ack(failure(error));
    }
  });
}
