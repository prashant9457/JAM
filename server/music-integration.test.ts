import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import { createJamSocketServer } from "./socket-server.ts";
import { DEFAULT_MUSIC_ID } from "../shared/music.ts";
import type {
  ApiResult,
  CreateRoomData,
  JoinRoomData,
  ClientToServerEvents,
  ServerToClientEvents,
  RoomSnapshot,
} from "../shared/jam.ts";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

function waitForRoom(
  client: Client,
  predicate: (room: RoomSnapshot) => boolean,
): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off("room:state", onRoom);
      reject(new Error("Timed out waiting for room state"));
    }, 3_000);
    function onRoom(room: RoomSnapshot) {
      if (!predicate(room)) return;
      clearTimeout(timer);
      client.off("room:state", onRoom);
      resolve(room);
    }
    client.on("room:state", onRoom);
  });
}

function data<T>(result: ApiResult<T>): T {
  if (!result.ok) assert.fail(result.error.message);
  return result.data;
}

test(
  "two real clients coordinate music readiness, shared starts, pause, and queue advancement",
  { timeout: 15_000 },
  async (t) => {
    const http = createServer();
    const server = createJamSocketServer([]);
    server.attach(http);
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;
    const clients: Client[] = [];
    t.after(async () => {
      clients.forEach((client) => client.disconnect());
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    async function newClient(): Promise<Client> {
      const client: Client = connect(url, {
        autoConnect: false,
        transports: ["websocket"],
        reconnection: false,
      });
      clients.push(client);
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("connect_error", reject);
        client.connect();
      });
      return client;
    }

    const host = await newClient();
    const guest = await newClient();
    const created = data<CreateRoomData>(
      await host.timeout(3_000).emitWithAck("room:create"),
    );
    const joined = data<JoinRoomData>(
      await guest
        .timeout(3_000)
        .emitWithAck("room:join", { code: created.room.code }),
    );
    assert.equal(joined.room.participants.length, 2);

    const clock = data<{
      serverSentAtMs?: number;
      serverReceivedAtMs?: number;
    }>(
      await guest
        .timeout(3_000)
        .emitWithAck("clock:sync", { clientSentAtMs: 1_000 }),
    );
    assert.ok(clock.serverSentAtMs! >= clock.serverReceivedAtMs!);

    const denied = await guest
      .timeout(3_000)
      .emitWithAck("music:play", { trackId: DEFAULT_MUSIC_ID });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.error.code, "HOST_ONLY");

    const selected = data<RoomSnapshot>(
      await host
        .timeout(3_000)
        .emitWithAck("music:play", { trackId: DEFAULT_MUSIC_ID }),
    );
    assert.ok(selected.sync);
    const firstReady = waitForRoom(
      guest,
      (room) => room.sync?.readyParticipantIds.length === 1,
    );
    host.emit("playback:ready", {
      trackId: DEFAULT_MUSIC_ID,
      syncId: selected.sync.id,
      roundTripMs: 20,
    });
    assert.equal((await firstReady).playback.status, "paused");

    const hostStart = waitForRoom(
      host,
      (room) => room.playback.status === "playing",
    );
    const guestStart = waitForRoom(
      guest,
      (room) => room.playback.status === "playing",
    );
    guest.emit("playback:ready", {
      trackId: DEFAULT_MUSIC_ID,
      syncId: selected.sync.id,
      roundTripMs: 800,
    });
    const [hostState, guestState] = await Promise.all([hostStart, guestStart]);
    assert.equal(hostState.playback.startsAtMs, guestState.playback.startsAtMs);
    assert.ok(hostState.playback.startsAtMs! > Date.now());

    const paused = data<RoomSnapshot>(
      await host.timeout(3_000).emitWithAck("playback:pause"),
    );
    assert.equal(paused.playback.status, "paused");
    const queued = data<RoomSnapshot>(
      await host.timeout(3_000).emitWithAck("queue:add", {
        trackId: "music-dream-culture",
        mediaType: "music",
      }),
    );
    assert.equal(queued.queue.length, 1);
    const next = data<RoomSnapshot>(
      await host.timeout(3_000).emitWithAck("playback:ended"),
    );
    assert.equal(next.playback.trackId, "music-dream-culture");
    assert.equal(next.playback.mediaType, "music");
    assert.equal(next.sync?.readyParticipantIds.length, 0);
  },
);
