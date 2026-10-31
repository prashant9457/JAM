import type { Server, Socket } from "socket.io";
import type {
  ApiResult,
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../../shared/jam.ts";
import type { RoomManager } from "../room-manager.ts";

export type JamSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type JamServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type Ack<T> = (result: ApiResult<T>) => void;
export type EventTimes = Map<string, number[]>;
export type PendingHostEnds = Map<string, ReturnType<typeof setTimeout>>;

export type SocketServices = {
  io: JamServer;
  rooms: RoomManager;
  eventTimes: EventTimes;
  pendingHostEnds: PendingHostEnds;
};
