import assert from "node:assert/strict";
import test from "node:test";
import { RoomManager } from "./room-manager.ts";
import { DEFAULT_MUSIC_ID } from "../shared/music.ts";

function createPair() {
  const rooms = new RoomManager();
  const created = rooms.createRoom("host");
  rooms.joinRoom(created.room.code, "guest");
  rooms.play(created.room.code, created.selfParticipantId);
  return { rooms, code: created.room.code, hostId: created.selfParticipantId };
}

test("waits for both taps then schedules a shared future start", () => {
  const { rooms, code } = createPair();
  const trackId = "1E-JAofFdVQ";
  const first = rooms.markPlaybackReady(code, "host", trackId)!;
  assert.equal(first.playback.status, "paused");
  assert.equal(first.playback.startsAtMs, null);
  assert.equal(first.sync?.readyParticipantIds.length, 1);
  const before = Date.now();
  const second = rooms.markPlaybackReady(code, "guest", trackId)!;
  assert.equal(second.sync, null);
  assert.equal(second.playback.status, "playing");
  assert.ok(second.playback.startsAtMs! >= before + 1_500);
});

test("duplicate taps and repeated host play do not count as another participant", () => {
  const { rooms, code, hostId } = createPair();
  rooms.markPlaybackReady(code, "host", "1E-JAofFdVQ");
  const duplicate = rooms.markPlaybackReady(code, "host", "1E-JAofFdVQ")!;
  assert.equal(duplicate.playback.status, "paused");
  assert.equal(duplicate.sync?.readyParticipantIds.length, 1);
  assert.equal(rooms.play(code, hostId).sync?.readyParticipantIds.length, 1);
});

test("readiness for the wrong video or a disconnected socket is ignored", () => {
  const { rooms, code } = createPair();
  assert.equal(rooms.markPlaybackReady(code, "host", "wrong-track"), undefined);
  assert.equal(
    rooms.markPlaybackReady(code, "unknown", "1E-JAofFdVQ"),
    undefined,
  );
});

test("a leaving ready participant is removed from the count", () => {
  const { rooms, code } = createPair();
  rooms.markPlaybackReady(code, "guest", "1E-JAofFdVQ");
  const after = rooms.leaveRoom(code, "guest")!;
  assert.equal(after.sync?.readyParticipantIds.length, 0);
  assert.equal(after.playback.status, "paused");
});

test("music mode selects catalog audio and restores the previous video", () => {
  const { rooms, code, hostId } = createPair();
  assert.equal(
    rooms.setMediaType(code, hostId, "music").playback.trackId,
    DEFAULT_MUSIC_ID,
  );
  assert.equal(
    rooms.setMediaType(code, hostId, "video").playback.trackId,
    "1E-JAofFdVQ",
  );
});

test("music waits for every decoded player and schedules for the slowest RTT", () => {
  const { rooms, code, hostId } = createPair();
  const selected = rooms.playMusic(code, hostId, DEFAULT_MUSIC_ID);
  const first = rooms.markPlaybackReady(
    code,
    "host",
    DEFAULT_MUSIC_ID,
    30,
    selected.sync!.id,
  )!;
  assert.equal(first.playback.status, "paused");
  const before = Date.now();
  const started = rooms.markPlaybackReady(
    code,
    "guest",
    DEFAULT_MUSIC_ID,
    1_000,
    selected.sync!.id,
  )!;
  assert.equal(started.sync, null);
  assert.equal(started.playback.status, "playing");
  assert.ok(started.playback.startsAtMs! >= before + 2_250);
});

test("reselecting music rejects readiness from the previous preparation round", () => {
  const { rooms, code, hostId } = createPair();
  const first = rooms.playMusic(code, hostId, DEFAULT_MUSIC_ID);
  const second = rooms.playMusic(code, hostId, DEFAULT_MUSIC_ID);
  assert.notEqual(first.sync!.id, second.sync!.id);
  assert.equal(
    rooms.markPlaybackReady(code, "host", DEFAULT_MUSIC_ID, 20, first.sync!.id),
    undefined,
  );
});

test("music selection remains host-only and validates library IDs", () => {
  const { rooms, code, hostId } = createPair();
  assert.throws(() => rooms.playMusic(code, "guest", DEFAULT_MUSIC_ID), /host/);
  assert.throws(() => rooms.playMusic(code, hostId, "unknown"), /library/);
  assert.throws(
    () => rooms.addToQueue(code, hostId, "unknown", "music"),
    /library/,
  );
});

test("music queue items retain their audio type when played and advanced", () => {
  const { rooms, code, hostId } = createPair();
  const added = rooms.addToQueue(code, hostId, DEFAULT_MUSIC_ID, "music");
  const selected = rooms.playQueueItem(code, hostId, added.queue[0].id);
  assert.equal(selected.playback.mediaType, "music");
  assert.equal(selected.sync?.trackId, DEFAULT_MUSIC_ID);
  assert.equal(selected.queue.length, 0);
  rooms.addToQueue(code, hostId, "music-dream-culture", "music");
  assert.equal(
    rooms.advanceQueue(code, hostId).playback.trackId,
    "music-dream-culture",
  );
});
