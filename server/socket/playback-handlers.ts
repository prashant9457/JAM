import { runHostCommand } from "./guards.ts";
import type { JamSocket, SocketServices } from "./types.ts";

export function registerPlaybackHandlers(
  socket: JamSocket,
  services: SocketServices,
) {
  const { rooms } = services;

  socket.on("playback:set-track", (payload, ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.setTrack(code, participantId, payload?.trackId),
    );
  });
  socket.on("playback:set-media-type", (payload, ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.setMediaType(code, participantId, payload?.mediaType),
    );
  });
  socket.on("queue:add", (payload, ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.addToQueue(
        code,
        participantId,
        payload?.trackId,
        payload?.mediaType,
      ),
    );
  });
  socket.on("queue:move", (payload, ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.moveQueueItem(
        code,
        participantId,
        payload?.itemId,
        payload?.toIndex,
      ),
    );
  });
  socket.on("queue:remove", (payload, ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.removeQueueItem(code, participantId, payload?.itemId),
    );
  });
  socket.on("queue:play", (payload, ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.playQueueItem(code, participantId, payload?.itemId),
    );
  });
  socket.on("playback:ended", (ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.advanceQueue(code, participantId),
    );
  });
  socket.on("playback:play", (ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.play(code, participantId),
    );
  });
  socket.on("playback:ready", (payload) => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms.markPlaybackReady(
      code,
      socket.id,
      payload?.trackId,
      payload?.roundTripMs,
      payload?.syncId,
    );
    if (room) services.io.to(code).emit("room:state", room);
  });
  socket.on("playback:pause", (ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.pause(code, participantId),
    );
  });

  socket.on("music:play", (payload, ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.playMusic(code, participantId, payload?.trackId),
    );
  });
  socket.on("playback:seek", (payload, ack) => {
    runHostCommand(socket, services, ack, (code, participantId) =>
      rooms.seek(code, participantId, payload?.positionSeconds ?? Number.NaN),
    );
  });
}
