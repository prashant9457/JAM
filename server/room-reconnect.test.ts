import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { io, type Socket } from "socket.io-client";
import { createJamSocketServer } from "./socket-server.ts";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ApiResult,
  CreateRoomData,
  JoinRoomData,
  RoomSnapshot,
} from "../shared/jam.ts";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
function data<T>(result: ApiResult<T>): T {
  if (!result.ok) assert.fail(result.error.message);
  return result.data;
}

test(
  "repeat joins and overlapping reconnects keep exactly one host and one guest",
  { timeout: 15_000 },
  async (t) => {
    const http = createServer();
    const server = createJamSocketServer([]);
    server.attach(http);
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    assert.ok(address && typeof address !== "string");
    const serverUrl = `http://127.0.0.1:${address.port}`;
    const clients: Client[] = [];
    t.after(async () => {
      clients.forEach((client) => client.disconnect());
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    async function client(): Promise<Client> {
      const socket: Client = io(serverUrl, {
        autoConnect: false,
        transports: ["websocket"],
        reconnection: false,
      });
      clients.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
        socket.connect();
      });
      return socket;
    }
    const host = await client();
    const created = data<CreateRoomData>(
      await host.timeout(3_000).emitWithAck("room:create"),
    );
    const code = created.room.code;
    const hostJoin = { code, hostToken: created.hostToken };
    const repeatedHost = data<JoinRoomData>(
      await host.timeout(3_000).emitWithAck("room:join", hostJoin),
    );
    assert.equal(
      repeatedHost.room.participants.length,
      1,
      "rejoining must not close the host's room",
    );

    let guest = await client();
    const guestJoin = {
      code,
      participantToken: "real-guest-session-secret-with-32-characters",
    };
    const initialGuest = data<JoinRoomData>(
      await guest.timeout(3_000).emitWithAck("room:join", guestJoin),
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      const repeated = data<JoinRoomData>(
        await guest.timeout(3_000).emitWithAck("room:join", guestJoin),
      );
      assert.equal(repeated.selfParticipantId, initialGuest.selfParticipantId);
      assert.equal(repeated.room.participants.length, 2);
      const disconnected = new Promise<void>((resolve) =>
        guest.once("disconnect", () => resolve()),
      );
      const replacement = await client();
      const rejoined = data<JoinRoomData>(
        await replacement.timeout(3_000).emitWithAck("room:join", guestJoin),
      );
      await disconnected;
      assert.equal(guest.connected, false);
      assert.equal(rejoined.selfParticipantId, initialGuest.selfParticipantId);
      assert.equal(rejoined.room.participants.length, 2);
      assert.equal(
        new Set(rejoined.room.participants.map((member) => member.id)).size,
        2,
      );
      guest = replacement;
    }

    const hostDisconnected = new Promise<void>((resolve) =>
      host.once("disconnect", () => resolve()),
    );
    const newHost = await client();
    const resumedHost = data<JoinRoomData>(
      await newHost.timeout(3_000).emitWithAck("room:join", hostJoin),
    );
    await hostDisconnected;
    assert.equal(resumedHost.room.participants.length, 2);
    assert.equal(
      resumedHost.room.participants.filter((member) => member.isHost).length,
      1,
    );
    assert.equal(resumedHost.selfParticipantId, created.room.hostParticipantId);
    const playable = data<RoomSnapshot>(
      await newHost
        .timeout(3_000)
        .emitWithAck("music:play", { trackId: "music-carefree" }),
    );
    assert.equal(playable.participants.length, 2);
    assert.equal(playable.sync?.readyParticipantIds.length, 0);

    const failedJoin = await guest.timeout(3_000).emitWithAck("room:join", {
      code: "000000",
      participantToken: guestJoin.participantToken,
    });
    assert.equal(failedJoin.ok, false);
    const chat = data<{ room: RoomSnapshot }>(
      await guest
        .timeout(3_000)
        .emitWithAck("chat:send", { text: "Still in my room" }),
    );
    assert.equal(chat.room.code, code);
    assert.equal(
      chat.room.participants.length,
      2,
      "a failed join must not abandon the current room",
    );
  },
);
