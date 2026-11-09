import assert from "node:assert/strict";
import test from "node:test";
import { MusicUploadStore } from "./music-upload-store.ts";
import { MAX_MP3_BYTES, validateMp3File } from "../shared/music-upload.ts";

const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);

test("validates extension, size, and empty files", () => {
  assert.equal(validateMp3File("song.MP3", 1), null);
  assert.ok(validateMp3File("song.wav", 1));
  assert.ok(validateMp3File("song.mp3", 0));
  assert.ok(validateMp3File("song.mp3", MAX_MP3_BYTES + 1));
  assert.ok(validateMp3File("song.mp3", Number.NaN));
});

test("only a completed and published upload can be downloaded", () => {
  const store = new MusicUploadStore();
  const grant = store.reserve("123456", "host", "song.mp3", mp3.length);
  assert.equal(store.audio(grant.uploadId), undefined);
  assert.equal(store.begin(grant.uploadId, grant.uploadToken), mp3.length);
  store.receive(grant.uploadId, mp3);
  assert.equal(store.audio(grant.uploadId), undefined);
  const track = store.pending(grant.uploadId, "123456", "host");
  assert.equal(track.title, "song");
  assert.equal(track.isUpload, true);
  store.publish(grant.uploadId);
  assert.deepEqual(store.audio(grant.uploadId), mp3);
});

test("upload links are one-use and cannot publish into a different room or owner", () => {
  const store = new MusicUploadStore();
  const grant = store.reserve("123456", "host", "song.mp3", mp3.length);
  assert.throws(() => store.begin(grant.uploadId, "wrong"));
  store.begin(grant.uploadId, grant.uploadToken);
  assert.throws(() => store.begin(grant.uploadId, grant.uploadToken));
  store.receive(grant.uploadId, mp3);
  assert.throws(() => store.pending(grant.uploadId, "999999", "host"));
  assert.throws(() => store.pending(grant.uploadId, "123456", "guest"));
});

test("renamed text files and incomplete uploads are rejected", () => {
  const store = new MusicUploadStore();
  const grant = store.reserve("123456", "host", "fake.mp3", 8);
  store.begin(grant.uploadId, grant.uploadToken);
  assert.throws(
    () => store.receive(grant.uploadId, Buffer.from("notaudio")),
    /MP3/,
  );
  assert.throws(
    () => store.receive(grant.uploadId, Buffer.from("short")),
    /incomplete/,
  );
  assert.throws(() => store.pending(grant.uploadId, "123456", "host"));
});

test("room upload quotas reserve capacity before receiving bytes", () => {
  const store = new MusicUploadStore();
  for (let index = 0; index < 3; index++)
    store.reserve("123456", "host", "song.mp3", MAX_MP3_BYTES);
  assert.throws(
    () => store.reserve("123456", "host", "another.mp3", 1),
    /full/,
  );
});

test("cancellation releases capacity but cannot delete another room's upload", () => {
  const store = new MusicUploadStore();
  const grant = store.reserve("123456", "host", "song.mp3", mp3.length);
  store.cancel(grant.uploadId, "999999", "host");
  store.begin(grant.uploadId, grant.uploadToken);
  store.cancel(grant.uploadId, "123456", "host");
  assert.throws(() => store.begin(grant.uploadId, grant.uploadToken));
});

test("closing a room releases its published audio and filenames are sanitized", () => {
  const store = new MusicUploadStore();
  const grant = store.reserve(
    "123456",
    "host",
    "../../private/hello\u0000.mp3",
    mp3.length,
  );
  store.begin(grant.uploadId, grant.uploadToken);
  store.receive(grant.uploadId, mp3);
  assert.equal(store.pending(grant.uploadId, "123456", "host").title, "hello");
  store.publish(grant.uploadId);
  store.prune(() => false);
  assert.equal(store.audio(grant.uploadId), undefined);
});

test("expired grants release reservations but published room audio remains available", (t) => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const store = new MusicUploadStore();
  const abandoned = store.reserve("123456", "host", "abandoned.mp3", 8);
  const published = store.reserve("123456", "host", "song.mp3", mp3.length);
  store.begin(published.uploadId, published.uploadToken);
  store.receive(published.uploadId, mp3);
  store.publish(published.uploadId);
  now += 6 * 60 * 1_000;
  assert.throws(() => store.begin(abandoned.uploadId, abandoned.uploadToken));
  store.prune(() => true);
  assert.deepEqual(store.audio(published.uploadId), mp3);
  assert.equal(
    store.pending(published.uploadId, "123456", "host").isUpload,
    true,
  );
});

test("a fake ID3 tag without MPEG audio frames is rejected", () => {
  const store = new MusicUploadStore();
  const bytes = Buffer.from([
    0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4,
  ]);
  const grant = store.reserve("123456", "host", "fake.mp3", bytes.length);
  store.begin(grant.uploadId, grant.uploadToken);
  assert.throws(() => store.receive(grant.uploadId, bytes), /MP3/);
});
