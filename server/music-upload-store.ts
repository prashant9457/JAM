import { randomBytes, randomUUID } from "node:crypto";
import type { MusicTrack } from "../shared/music.ts";
import {
  MAX_ROOM_UPLOADS,
  validateMp3File,
  type MusicUploadGrant,
} from "../shared/music-upload.ts";
import { RoomError } from "./room-manager.ts";

const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_ROOM_BYTES = 60 * 1024 * 1024;
const GRANT_TTL_MS = 5 * 60 * 1_000;

type Upload = {
  roomCode: string;
  participantId: string;
  token: string;
  size: number;
  expiresAt: number;
  state: "waiting" | "receiving" | "received" | "published";
  track: MusicTrack;
  bytes?: Buffer;
};

/** Bounded, temporary room storage; bytes never enter the repository or room snapshots. */
export class MusicUploadStore {
  private uploads = new Map<string, Upload>();

  reserve(
    roomCode: string,
    participantId: string,
    name: string,
    size: number,
  ): MusicUploadGrant {
    const invalid = validateMp3File(name, size);
    if (invalid) throw new RoomError("INVALID_INPUT", invalid);
    const all = [...this.uploads.values()];
    const inRoom = all.filter((upload) => upload.roomCode === roomCode);
    if (
      inRoom.length >= MAX_ROOM_UPLOADS ||
      inRoom.reduce((sum, upload) => sum + upload.size, 0) + size >
        MAX_ROOM_BYTES
    ) {
      throw new RoomError(
        "ROOM_LIMIT",
        "This room's temporary upload storage is full (10 tracks / 60 MB).",
      );
    }
    if (
      all.reduce((sum, upload) => sum + upload.size, 0) + size >
      MAX_TOTAL_BYTES
    ) {
      throw new RoomError(
        "ROOM_LIMIT",
        "Temporary music storage is full. Try again later.",
      );
    }
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const title =
      name
        .replace(/^.*[\\/]/, "")
        .replace(/\.mp3$/i, "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 100) || "Uploaded track";
    this.uploads.set(id, {
      roomCode,
      participantId,
      token,
      size,
      expiresAt: Date.now() + GRANT_TTL_MS,
      state: "waiting",
      track: {
        id: `upload-${id}`,
        title,
        artist: "Room upload",
        mood: "Uploaded MP3",
        color: "#b5b6d8",
        src: `/music/uploads/${id}`,
        sourceUrl: "",
        isUpload: true,
      },
    });
    return {
      uploadId: id,
      uploadToken: token,
      uploadPath: `/music/uploads/${id}`,
    };
  }

  begin(id: string, token: string): number {
    const upload = this.uploads.get(id);
    if (
      !upload ||
      upload.expiresAt < Date.now() ||
      upload.token !== token ||
      upload.state !== "waiting"
    ) {
      throw new RoomError(
        "INVALID_INPUT",
        "This upload link has expired or was already used. Try again.",
      );
    }
    upload.state = "receiving";
    return upload.size;
  }

  receive(id: string, bytes: Buffer): void {
    const upload = this.uploads.get(id);
    if (
      !upload ||
      upload.state !== "receiving" ||
      bytes.length !== upload.size
    ) {
      throw new RoomError(
        "INVALID_INPUT",
        "The upload was incomplete. Try again.",
      );
    }
    if (!hasMp3Audio(bytes))
      throw new RoomError(
        "INVALID_INPUT",
        "This file does not contain recognizable MP3 audio.",
      );
    upload.bytes = bytes;
    upload.state = "received";
  }

  pending(id: string, roomCode: string, participantId: string): MusicTrack {
    const upload = this.uploads.get(id);
    if (
      !upload ||
      upload.roomCode !== roomCode ||
      upload.participantId !== participantId ||
      (upload.state !== "published" && upload.expiresAt < Date.now()) ||
      (upload.state !== "received" && upload.state !== "published")
    ) {
      throw new RoomError(
        "INVALID_INPUT",
        "The upload is not ready or does not belong to this room.",
      );
    }
    return upload.track;
  }

  publish(id: string): void {
    const upload = this.uploads.get(id);
    if (upload) {
      upload.state = "published";
      upload.token = "";
    }
  }

  audio(id: string): Buffer | undefined {
    const upload = this.uploads.get(id);
    return upload?.state === "published" ? upload.bytes : undefined;
  }

  cancel(id: string, roomCode?: string, participantId?: string): void {
    const upload = this.uploads.get(id);
    if (
      upload &&
      upload.state !== "published" &&
      (!roomCode || upload.roomCode === roomCode) &&
      (!participantId || upload.participantId === participantId)
    )
      this.uploads.delete(id);
  }

  prune(hasRoom: (code: string) => boolean): void {
    for (const [id, upload] of this.uploads) {
      if (
        !hasRoom(upload.roomCode) ||
        (upload.state !== "published" && upload.expiresAt < Date.now())
      )
        this.uploads.delete(id);
    }
  }
}

function hasMp3Audio(bytes: Buffer): boolean {
  let start = 0;
  if (bytes.subarray(0, 3).toString() === "ID3") {
    if (bytes.length < 10) return false;
    if ([bytes[6], bytes[7], bytes[8], bytes[9]].some((byte) => byte & 0x80))
      return false;
    start =
      10 + (bytes[6] << 21) + (bytes[7] << 14) + (bytes[8] << 7) + bytes[9];
    if (bytes[5] & 0x10) start += 10;
  }
  const end = Math.min(bytes.length - 3, start + 4_096);
  for (let index = start; index < end; index++) {
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    // MPEG Layer III frame sync, valid version, bitrate and sample-rate indices.
    if (
      bytes[index] === 0xff &&
      (b & 0xe0) === 0xe0 &&
      (b & 0x18) !== 0x08 &&
      (b & 0x06) === 0x02 &&
      (c & 0xf0) !== 0 &&
      (c & 0xf0) !== 0xf0 &&
      (c & 0x0c) !== 0x0c
    )
      return true;
  }
  return false;
}
