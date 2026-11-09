import assert from "node:assert/strict";
import test from "node:test";
import { selectRoomSnapshot } from "./room-snapshot.ts";
import { RoomManager } from "../../server/room-manager.ts";

test("a delayed ack cannot resurrect participants removed by a newer broadcast", () => {
  const rooms = new RoomManager();
  const created = rooms.createRoom("host");
  const joined = rooms.joinRoom(created.room.code, "guest").room;
  const left = rooms.leaveRoom(created.room.code, "guest")!;
  assert.ok(left.revision > joined.revision);
  assert.equal(selectRoomSnapshot(left, joined, created.room.code), left);
  assert.equal(selectRoomSnapshot(left, left, created.room.code), left);
  assert.equal(selectRoomSnapshot(joined, left, created.room.code), left);
});

test("late events from a previous room cannot replace the active room", () => {
  const rooms = new RoomManager();
  const first = rooms.createRoom("host-a").room;
  const second = rooms.createRoom("host-b").room;
  assert.equal(selectRoomSnapshot(second, first, second.code), second);
  assert.equal(selectRoomSnapshot(null, first, second.code), null);
});
