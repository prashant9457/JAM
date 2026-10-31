/** A connected member currently present in a room. */
export type Participant = {
  id: string;
  name: string;
  isHost: boolean;
};

export type ChatMessage = {
  id: string;
  participantId: string;
  participantName: string;
  text: string;
  createdAtMs: number;
};

export type QueueItem = {
  id: string;
  trackId: string;
  mediaType: "music" | "video";
};

export const DEFAULT_VIDEO_ID = "ZTmF2v59CtI";

/** Shared playback timeline. Clients derive their local playhead from this. */
export type PlaybackState = {
  status: "idle" | "playing" | "paused";
  mediaType: "music" | "video";
  trackId: string | null;
  positionSeconds: number;
  /** Unix timestamp for the scheduled start, allowing clients to start together. */
  startsAtMs: number | null;
};

/** Safe room data sent to every member. Never include the host credential here. */
export type RoomSnapshot = {
  code: string;
  hostParticipantId: string;
  participants: Participant[];
  playback: PlaybackState;
  /** Present while clients prepare the selected YouTube player before a shared start. */
  sync: { trackId: string; readyParticipantIds: string[] } | null;
  queue: QueueItem[];
  messages: ChatMessage[];
  updatedAtMs: number;
};

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_LIMIT"
  | "NOT_IN_ROOM"
  | "HOST_ONLY"
  | "NO_TRACK_SELECTED"
  | "MESSAGE_INVALID"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ApiErrorCode; message: string } };

export type CreateRoomData = {
  room: RoomSnapshot;
  /** Secret credential returned only to the creator. Keep it in sessionStorage. */
  hostToken: string;
};

export type JoinRoomData = {
  room: RoomSnapshot;
  selfParticipantId: string;
};

export type ClientToServerEvents = {
  "room:create": (ack: (result: ApiResult<CreateRoomData>) => void) => void;
  "room:join": (
    payload: { code: string; hostToken?: string },
    ack: (result: ApiResult<JoinRoomData>) => void,
  ) => void;
  "room:leave": (ack: (result: ApiResult<{ ok: true }>) => void) => void;
  "clock:sync": (
    payload: { clientSentAtMs: number },
    ack: (result: ApiResult<{ clientSentAtMs: number; serverTimeMs: number }>) => void,
  ) => void;
  "chat:send": (
    payload: { text: string },
    ack: (result: ApiResult<{ room: RoomSnapshot }>) => void,
  ) => void;
  "playback:set-track": (
    payload: { trackId: string | null },
    ack: (result: ApiResult<RoomSnapshot>) => void,
  ) => void;
  "playback:set-media-type": (
    payload: { mediaType: "music" | "video" },
    ack: (result: ApiResult<RoomSnapshot>) => void,
  ) => void;
  "queue:add": (
    payload: { trackId: string; mediaType: "music" | "video" },
    ack: (result: ApiResult<RoomSnapshot>) => void,
  ) => void;
  "queue:move": (
    payload: { itemId: string; toIndex: number },
    ack: (result: ApiResult<RoomSnapshot>) => void,
  ) => void;
  "queue:remove": (
    payload: { itemId: string },
    ack: (result: ApiResult<RoomSnapshot>) => void,
  ) => void;
  "queue:play": (
    payload: { itemId: string },
    ack: (result: ApiResult<RoomSnapshot>) => void,
  ) => void;
  "playback:ended": (ack: (result: ApiResult<RoomSnapshot>) => void) => void;
  "playback:play": (ack: (result: ApiResult<RoomSnapshot>) => void) => void;
  "playback:ready": (payload: { trackId: string }) => void;
  "playback:pause": (ack: (result: ApiResult<RoomSnapshot>) => void) => void;
  "playback:seek": (
    payload: { positionSeconds: number },
    ack: (result: ApiResult<RoomSnapshot>) => void,
  ) => void;
};

export type ServerToClientEvents = {
  "room:state": (room: RoomSnapshot) => void;
  "room:ended": (payload: { code: string }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  roomCode?: string;
  participantId?: string;
  isHost?: boolean;
};
