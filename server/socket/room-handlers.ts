import { allowEvent, failure, leaveCurrentRoom } from "./guards.ts";
import type { JamSocket, SocketServices } from "./types.ts";

export function registerRoomHandlers(
  socket: JamSocket,
  services: SocketServices,
) {
  const { io, rooms, eventTimes, pendingHostEnds } = services;

  socket.on("room:create", (ack) => {
    if (!allowEvent(socket, eventTimes, ack)) return;
    try {
      leaveCurrentRoom(socket, services);
      const created = rooms.createRoom(socket.id);
      socket.join(created.room.code);
      socket.data.roomCode = created.room.code;
      socket.data.participantId = created.selfParticipantId;
      socket.data.isHost = true;
      ack({
        ok: true,
        data: { room: created.room, hostToken: created.hostToken },
      });
      io.to(created.room.code).emit("room:state", created.room);
    } catch (error) {
      ack(failure(error));
    }
  });

  socket.on("room:join", (payload, ack) => {
    if (!allowEvent(socket, eventTimes, ack)) return;
    try {
      const joined = rooms.joinRoom(
        payload?.code ?? "",
        socket.id,
        payload?.hostToken,
        payload?.participantToken,
      );
      if (socket.data.roomCode && socket.data.roomCode !== joined.room.code)
        leaveCurrentRoom(socket, services);
      for (const previousId of joined.replacedSocketIds) {
        const previous = io.sockets.sockets.get(previousId);
        if (!previous) continue;
        previous.leave(joined.room.code);
        previous.data.roomCode = undefined;
        previous.data.participantId = undefined;
        previous.data.isHost = false;
        previous.emit("room:session-replaced");
        previous.disconnect(true);
      }
      if (joined.room.hostParticipantId === joined.selfParticipantId) {
        const pendingEnd = pendingHostEnds.get(joined.room.code);
        if (pendingEnd) clearTimeout(pendingEnd);
        pendingHostEnds.delete(joined.room.code);
      }
      socket.join(joined.room.code);
      socket.data.roomCode = joined.room.code;
      socket.data.participantId = joined.selfParticipantId;
      socket.data.isHost =
        joined.room.hostParticipantId === joined.selfParticipantId;
      ack({
        ok: true,
        data: {
          room: joined.room,
          selfParticipantId: joined.selfParticipantId,
        },
      });
      io.to(joined.room.code).emit("room:state", joined.room);
    } catch (error) {
      ack(failure(error));
    }
  });

  socket.on("room:leave", (ack) => {
    if (!allowEvent(socket, eventTimes, ack)) return;
    leaveCurrentRoom(socket, services);
    ack({ ok: true, data: { ok: true } });
  });

  socket.on("clock:sync", (payload, ack) => {
    const serverReceivedAtMs = Date.now();
    if (!allowEvent(socket, eventTimes, ack)) return;
    if (!Number.isFinite(payload?.clientSentAtMs)) {
      ack({
        ok: false,
        error: { code: "INVALID_INPUT", message: "Invalid client timestamp." },
      });
      return;
    }
    ack({
      ok: true,
      data: {
        clientSentAtMs: payload.clientSentAtMs,
        serverTimeMs: Date.now(),
        serverReceivedAtMs,
        serverSentAtMs: Date.now(),
      },
    });
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket, services, true);
    eventTimes.delete(socket.id);
  });
}
