import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import { createJamSocketServer } from "./socket-server.ts";
import { DEFAULT_MUSIC_ID } from "../shared/music.ts";
import { MusicUploadStore } from "./music-upload-store.ts";
import { createMusicUploadHandler } from "./music-upload-http.ts";
import type { MusicUploadGrant } from "../shared/music-upload.ts";
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
    const uploads = new MusicUploadStore();
    const handleUpload = createMusicUploadHandler(uploads, []);
    const http = createServer(async (request, response) => {
      if (!(await handleUpload(request, response)))
        response.writeHead(404).end();
    });
    const server = createJamSocketServer([], uploads);
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

    const guestUpload = await guest
      .timeout(3_000)
      .emitWithAck("music:prepare-upload", { name: "guest.mp3", size: 8 });
    assert.equal(guestUpload.ok, false);
    if (!guestUpload.ok) assert.equal(guestUpload.error.code, "HOST_ONLY");

    const bytes = readFileSync(
      new URL("../public/music/carefree.mp3", import.meta.url),
    );
    const grant = data<MusicUploadGrant>(
      await host.timeout(3_000).emitWithAck("music:prepare-upload", {
        name: "My song.mp3",
        size: bytes.length,
      }),
    );
    const uploadUrl = `${url}${grant.uploadPath}`;
    const origin = "http://localhost:3000";
    assert.equal((await fetch(uploadUrl)).status, 404);
    const preflight = await fetch(uploadUrl, {
      method: "OPTIONS",
      headers: { Origin: origin },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    assert.equal(
      (
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { Authorization: "Bearer invalid" },
          body: bytes,
        })
      ).status,
      400,
    );
    const transfer = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${grant.uploadToken}`,
        "Content-Type": "audio/mpeg",
        Origin: origin,
      },
      body: bytes,
    });
    assert.equal(transfer.status, 200, await transfer.text());
    assert.equal(
      (await fetch(uploadUrl)).status,
      404,
      "unpublished audio must not be exposed",
    );
    const wrongOwner = await guest
      .timeout(3_000)
      .emitWithAck("music:complete-upload", { uploadId: grant.uploadId });
    assert.equal(wrongOwner.ok, false);

    const guestLibrary = waitForRoom(guest, (room) =>
      room.musicTracks.some((track) => track.isUpload),
    );
    const published = data<RoomSnapshot>(
      await host
        .timeout(3_000)
        .emitWithAck("music:complete-upload", { uploadId: grant.uploadId }),
    );
    const uploaded = published.musicTracks.find((track) => track.isUpload)!;
    assert.equal(uploaded.title, "My song");
    assert.equal(published.queue[0].trackId, uploaded.id);
    const repeated = data<RoomSnapshot>(
      await host
        .timeout(3_000)
        .emitWithAck("music:complete-upload", { uploadId: grant.uploadId }),
    );
    assert.equal(
      repeated.queue.length,
      published.queue.length,
      "repeating completion must not duplicate a song",
    );
    assert.equal(
      published.playback.trackId,
      "music-dream-culture",
      "uploading must not interrupt the current track",
    );
    assert.equal(
      (await guestLibrary).musicTracks.find((track) => track.id === uploaded.id)
        ?.src,
      uploaded.src,
    );
    const download = await fetch(`${url}${uploaded.src}`, {
      headers: { Origin: origin },
    });
    assert.equal(download.headers.get("content-type"), "audio/mpeg");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    assert.equal(
      (
        await fetch(`${url}${uploaded.src}`, {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );

    const uploadedPlayback = data<RoomSnapshot>(
      await host
        .timeout(3_000)
        .emitWithAck("music:play", { trackId: uploaded.id }),
    );
    assert.equal(uploadedPlayback.sync?.trackId, uploaded.id);
    const uploadedStart = waitForRoom(
      guest,
      (room) =>
        room.playback.status === "playing" &&
        room.playback.trackId === uploaded.id,
    );
    for (const client of [host, guest])
      client.emit("playback:ready", {
        trackId: uploaded.id,
        syncId: uploadedPlayback.sync!.id,
      });
    assert.equal((await uploadedStart).sync, null);

    const lateClient = await newClient();
    const lateRoom = data<JoinRoomData>(
      await lateClient
        .timeout(3_000)
        .emitWithAck("room:join", { code: created.room.code }),
    );
    assert.ok(
      lateRoom.room.musicTracks.some((track) => track.id === uploaded.id),
    );
  },
);
