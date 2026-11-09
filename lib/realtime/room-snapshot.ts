import type { RoomSnapshot } from "../../shared/jam.ts";

/** Ignore delayed acks and duplicate broadcasts that would resurrect stale members/state. */
export function selectRoomSnapshot(
  current: RoomSnapshot | null,
  incoming: RoomSnapshot,
  code: string,
): RoomSnapshot | null {
  if (incoming.code !== code) return current;
  if (
    current?.code === code &&
    current.revision !== undefined &&
    incoming.revision !== undefined &&
    incoming.revision <= current.revision
  )
    return current;
  return incoming;
}
