import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { DEFAULT_VIDEO_ID } from "../shared/jam.ts";
import type {
  ApiErrorCode,
  ChatMessage,
  Participant,
  PlaybackState,
  QueueItem,
  RoomSnapshot,
} from "../shared/jam.ts";

const ROOM_CODE_PATTERN = /^\d{6}$/;
const TRACK_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const PLAY_SCHEDULE_LEAD_MS = 1_500;
const MAX_ROOM_SIZE = 16;
const MAX_ACTIVE_ROOMS = 10_000;

type RoomRecord = {
  code: string;
  hostParticipantId: string;
  hostTokenDigest: Buffer;
  participantsBySocket: Map<string, Participant>;
  playback: PlaybackState;
  sync: { trackId: string; readyParticipantIds: Set<string> } | null;
  queue: QueueItem[];
  messages: ChatMessage[];
  updatedAtMs: number;
};

export class RoomError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RoomError";
  }
}

/** Owns temporary room state and enforces room-level invariants. */
export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();

  createRoom(socketId: string) {
    this.removeExpiredRooms();
    if (this.rooms.size >= MAX_ACTIVE_ROOMS) {
      throw new RoomError("ROOM_LIMIT", "The server is at room capacity. Try again later.");
    }

    let code: string;
    do {
      code = String(randomInt(100_000, 1_000_000));
    } while (this.rooms.has(code));

    const hostToken = randomBytes(32).toString("base64url");
    const hostParticipantId = randomUUID();
    const now = Date.now();
    const room: RoomRecord = {
      code,
      hostParticipantId,
      hostTokenDigest: this.digestToken(hostToken),
      participantsBySocket: new Map([
        [socketId, { id: hostParticipantId, name: this.makeName("Host"), isHost: true }],
      ]),
      playback: { status: "idle", mediaType: "video", trackId: DEFAULT_VIDEO_ID, positionSeconds: 0, startsAtMs: null },
      sync: null,
      queue: [],
      messages: [],
      updatedAtMs: now,
    };

    this.rooms.set(code, room);
    return { room: this.toSnapshot(room), hostToken, selfParticipantId: hostParticipantId };
  }

  joinRoom(code: string, socketId: string, hostToken?: string) {
    const normalizedCode = this.normalizeCode(code);
    const room = this.rooms.get(normalizedCode);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "That jam room does not exist or has expired.");

    let isHost = false;
    if (hostToken !== undefined) {
      if (!this.isValidHostToken(room, hostToken)) {
        throw new RoomError("INVALID_INPUT", "The saved host session is invalid. Join as a guest instead.");
      }
      isHost = true;
    }

    if (!room.participantsBySocket.has(socketId) && room.participantsBySocket.size >= MAX_ROOM_SIZE) {
      throw new RoomError("ROOM_FULL", "This room has reached its participant limit.");
    }

    const participantId = isHost ? room.hostParticipantId : randomUUID();
    const participant: Participant = {
      id: participantId,
      name: isHost ? this.makeName("Host") : this.makeName("Guest"),
      isHost,
    };
    room.participantsBySocket.set(socketId, participant);
    room.updatedAtMs = Date.now();

    return { room: this.toSnapshot(room), selfParticipantId: participantId };
  }

  leaveRoom(code: string, socketId: string): RoomSnapshot | undefined {
    const room = this.rooms.get(code);
    if (!room) return undefined;

    room.participantsBySocket.delete(socketId);
    this.startIfEveryoneReady(room);
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  /** Permanently closes a room when its host leaves. */
  endRoom(code: string, socketId: string): boolean {
    const room = this.rooms.get(code);
    if (!room || room.participantsBySocket.get(socketId)?.isHost !== true) return false;
    this.rooms.delete(code);
    return true;
  }

  hasConnectedHost(code: string): boolean {
    const room = this.rooms.get(code);
    return Boolean(room && [...room.participantsBySocket.values()].some((participant) => participant.isHost));
  }

  endRoomByCode(code: string): boolean {
    return this.rooms.delete(code);
  }

  setTrack(code: string, participantId: string, trackId: unknown): RoomSnapshot {
    const room = this.getAuthorizedRoom(code, participantId);
    if (trackId !== null && (typeof trackId !== "string" || !TRACK_ID_PATTERN.test(trackId))) {
      throw new RoomError("INVALID_INPUT", "Track ID has an invalid format.");
    }

    room.playback = { status: "idle", mediaType: "video", trackId, positionSeconds: 0, startsAtMs: null };
    room.sync = null;
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  setMediaType(code: string, participantId: string, mediaType: unknown): RoomSnapshot {
    const room = this.getAuthorizedRoom(code, participantId);
    if (mediaType !== "music" && mediaType !== "video") {
      throw new RoomError("INVALID_INPUT", "Choose music or video.");
    }
    room.playback = { ...room.playback, mediaType };
    room.sync = null;
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  addToQueue(code: string, participantId: string, trackId: unknown, mediaType: unknown): RoomSnapshot {
    const room = this.getAuthorizedRoom(code, participantId);
    if (typeof trackId !== "string" || !TRACK_ID_PATTERN.test(trackId)) {
      throw new RoomError("INVALID_INPUT", "The YouTube video ID has an invalid format.");
    }
    if (mediaType !== "music" && mediaType !== "video") {
      throw new RoomError("INVALID_INPUT", "Choose music or video.");
    }
    if (room.queue.length >= 100) {
      throw new RoomError("ROOM_LIMIT", "The queue can hold up to 100 items.");
    }

    room.queue.push({ id: randomUUID(), trackId, mediaType });
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  moveQueueItem(code: string, participantId: string, itemId: unknown, toIndex: unknown): RoomSnapshot {
    const room = this.getAuthorizedRoom(code, participantId);
    if (typeof itemId !== "string" || !Number.isInteger(toIndex)) {
      throw new RoomError("INVALID_INPUT", "Choose a valid queue position.");
    }
    const fromIndex = room.queue.findIndex((item) => item.id === itemId);
    if (fromIndex < 0 || (toIndex as number) < 0 || (toIndex as number) >= room.queue.length) {
      throw new RoomError("INVALID_INPUT", "That queue item no longer exists.");
    }
    const [item] = room.queue.splice(fromIndex, 1);
    room.queue.splice(toIndex as number, 0, item);
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  removeQueueItem(code: string, participantId: string, itemId: unknown): RoomSnapshot {
    const room = this.getAuthorizedRoom(code, participantId);
    if (typeof itemId !== "string") throw new RoomError("INVALID_INPUT", "Choose a valid queue item.");
    const index = room.queue.findIndex((item) => item.id === itemId);
    if (index < 0) throw new RoomError("INVALID_INPUT", "That queue item no longer exists.");
    room.queue.splice(index, 1);
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  playQueueItem(code: string, participantId: string, itemId: unknown): RoomSnapshot {
    const room = this.getAuthorizedRoom(code, participantId);
    if (typeof itemId !== "string") throw new RoomError("INVALID_INPUT", "Choose a valid queue item.");
    const index = room.queue.findIndex((item) => item.id === itemId);
    if (index < 0) throw new RoomError("INVALID_INPUT", "That queue item no longer exists.");
    const [item] = room.queue.splice(index, 1);
    room.playback = {
      status: "paused",
      mediaType: item.mediaType,
      trackId: item.trackId,
      positionSeconds: 0,
      startsAtMs: null,
    };
    room.sync = { trackId: item.trackId, readyParticipantIds: new Set() };
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  advanceQueue(code: string, participantId: string): RoomSnapshot {
    const room = this.getAuthorizedRoom(code, participantId);
    const nextItem = room.queue.shift();
    if (nextItem) {
      room.playback = {
        status: "paused",
        mediaType: nextItem.mediaType,
        trackId: nextItem.trackId,
        positionSeconds: 0,
        startsAtMs: null,
      };
      room.sync = { trackId: nextItem.trackId, readyParticipantIds: new Set() };
    } else {
      room.playback = {
        ...room.playback,
        status: "paused",
        positionSeconds: this.currentPosition(room.playback),
        startsAtMs: null,
      };
      room.sync = null;
    }
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  play(code: string, participantId: string): RoomSnapshot {
    const room = this.getAuthorizedRoom(code, participantId);
    if (!room.playback.trackId) {
      throw new RoomError("NO_TRACK_SELECTED", "Select a track before starting playback.");
    }

    const trackId = room.playback.trackId;
    room.playback = { ...room.playback, status: "paused", positionSeconds: this.currentPosition(room.playback), startsAtMs: null };
    room.sync = { trackId, readyParticipantIds: new Set() };
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  /** Start only once every connected participant reports that their player is cued. */
  markPlaybackReady(code: string, socketId: string, trackId: unknown): RoomSnapshot | undefined {
    const room = this.rooms.get(code);
    const participant = room?.participantsBySocket.get(socketId);
    if (!room || !participant || typeof trackId !== "string" || !room.sync || room.sync.trackId !== trackId) return;
    room.sync.readyParticipantIds.add(participant.id);
    this.startIfEveryoneReady(room);
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  private startIfEveryoneReady(room: RoomRecord): void {
    if (!room.sync || room.participantsBySocket.size === 0) return;
    const connectedIds = [...room.participantsBySocket.values()].map((participant) => participant.id);
    if (!connectedIds.every((id) => room.sync?.readyParticipantIds.has(id))) return;
    room.playback = { ...room.playback, status: "playing", startsAtMs: Date.now() + PLAY_SCHEDULE_LEAD_MS };
    room.sync = null;
  }

  pause(code: string, participantId: string): RoomSnapshot {
    const room = this.getAuthorizedRoom(code, participantId);
    room.playback = {
      ...room.playback,
      status: "paused",
      positionSeconds: this.currentPosition(room.playback),
      startsAtMs: null,
    };
    room.sync = null;
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  seek(code: string, participantId: string, positionSeconds: number): RoomSnapshot {
    const room = this.getAuthorizedRoom(code, participantId);
    if (!Number.isFinite(positionSeconds) || positionSeconds < 0 || positionSeconds > 43_200) {
      throw new RoomError("INVALID_INPUT", "Seek position must be between 0 and 12 hours.");
    }

    room.playback = {
      ...room.playback,
      positionSeconds,
      startsAtMs: room.playback.status === "playing" ? Date.now() + 300 : null,
    };
    room.sync = null;
    room.updatedAtMs = Date.now();
    return this.toSnapshot(room);
  }

  sendMessage(code: string, participantId: string, messageText: unknown): RoomSnapshot {
    const room = this.rooms.get(code);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "That jam room has expired.");

    const participant = [...room.participantsBySocket.values()].find((member) => member.id === participantId);
    if (!participant) throw new RoomError("NOT_IN_ROOM", "Join the room before sending a message.");
    if (typeof messageText !== "string") {
      throw new RoomError("MESSAGE_INVALID", "Message must be plain text.");
    }

    const text = messageText.trim();
    if (!text || text.length > 500) {
      throw new RoomError("MESSAGE_INVALID", "Messages must be between 1 and 500 characters.");
    }

    const message: ChatMessage = {
      id: randomUUID(),
      participantId,
      participantName: participant.name,
      text,
      createdAtMs: Date.now(),
    };
    room.messages.push(message);
    if (room.messages.length > 100) room.messages.splice(0, room.messages.length - 100);
    room.updatedAtMs = message.createdAtMs;
    return this.toSnapshot(room);
  }

  removeExpiredRooms(now = Date.now()) {
    for (const [code, room] of this.rooms) {
      if (room.participantsBySocket.size === 0 && now - room.updatedAtMs > ROOM_TTL_MS) {
        this.rooms.delete(code);
      }
    }
  }

  private getAuthorizedRoom(code: string, participantId: string): RoomRecord {
    const room = this.rooms.get(code);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "That jam room has expired.");
    if (participantId !== room.hostParticipantId) {
      throw new RoomError("HOST_ONLY", "Only the room host can control playback.");
    }
    return room;
  }

  private normalizeCode(code: string): string {
    if (typeof code !== "string" || !ROOM_CODE_PATTERN.test(code)) {
      throw new RoomError("INVALID_INPUT", "Enter a valid six-digit room code.");
    }
    return code;
  }

  private isValidHostToken(room: RoomRecord, token: string): boolean {
    if (typeof token !== "string" || token.length > 128) return false;
    const candidate = this.digestToken(token);
    return timingSafeEqual(room.hostTokenDigest, candidate);
  }

  private digestToken(token: string): Buffer {
    return createHash("sha256").update(token).digest();
  }

  private currentPosition(playback: PlaybackState): number {
    if (playback.status !== "playing" || playback.startsAtMs === null) {
      return playback.positionSeconds;
    }
    const elapsedMs = Math.max(0, Date.now() - playback.startsAtMs);
    return playback.positionSeconds + elapsedMs / 1_000;
  }

  private toSnapshot(room: RoomRecord): RoomSnapshot {
    return {
      code: room.code,
      hostParticipantId: room.hostParticipantId,
      participants: [...room.participantsBySocket.values()],
      playback: { ...room.playback },
      sync: room.sync ? { trackId: room.sync.trackId, readyParticipantIds: [...room.sync.readyParticipantIds] } : null,
      queue: [...room.queue],
      messages: [...room.messages],
      updatedAtMs: room.updatedAtMs,
    };
  }

  private makeName(role: "Host" | "Guest"): string {
    return `${role}-${randomInt(1_000, 10_000)}`;
  }
}
