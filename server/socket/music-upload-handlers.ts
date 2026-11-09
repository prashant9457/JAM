import { allowEvent, failure } from "./guards.ts";
import { RoomError } from "../room-manager.ts";
import type { JamSocket, SocketServices } from "./types.ts";

export function registerMusicUploadHandlers(
  socket: JamSocket,
  services: SocketServices,
) {
  const { rooms, uploads, io, eventTimes } = services;
  socket.on("music:prepare-upload", (payload, ack) => {
    if (!allowEvent(socket, eventTimes, ack)) return;
    try {
      const { roomCode, participantId } = socket.data;
      if (!roomCode || !participantId)
        throw new RoomError(
          "NOT_IN_ROOM",
          "Join a room before uploading music.",
        );
      rooms.assertCanUpload(roomCode, participantId);
      uploads.prune((code) => rooms.hasRoom(code));
      const grant = uploads.reserve(
        roomCode,
        participantId,
        payload?.name,
        payload?.size,
      );
      ack({ ok: true, data: grant });
    } catch (error) {
      ack(failure(error));
    }
  });

  socket.on("music:complete-upload", (payload, ack) => {
    if (!allowEvent(socket, eventTimes, ack)) return;
    try {
      const { roomCode, participantId } = socket.data;
      if (!roomCode || !participantId)
        throw new RoomError(
          "NOT_IN_ROOM",
          "Join a room before adding this upload.",
        );
      const track = uploads.pending(payload?.uploadId, roomCode, participantId);
      const room = rooms.addUploadedMusic(roomCode, participantId, track);
      uploads.publish(payload.uploadId);
      ack({ ok: true, data: room });
      io.to(roomCode).emit("room:state", room);
    } catch (error) {
      ack(failure(error));
    }
  });

  socket.on("music:cancel-upload", (payload) => {
    const { roomCode, participantId } = socket.data;
    if (roomCode && participantId)
      uploads.cancel(payload?.uploadId, roomCode, participantId);
  });
}
