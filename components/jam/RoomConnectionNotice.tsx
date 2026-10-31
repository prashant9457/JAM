import type { ConnectionStatus } from "./hooks/useJamRoomSession";

type RoomConnectionNoticeProps = {
  connectionStatus: ConnectionStatus;
  errorMessage: string;
};

export default function RoomConnectionNotice({ connectionStatus, errorMessage }: RoomConnectionNoticeProps) {
  if (!errorMessage && connectionStatus === "connected") return null;

  return (
    <div className="fixed left-1/2 top-14 z-10 w-[min(92vw,520px)] -translate-x-1/2">
      <p
        role={errorMessage ? "alert" : "status"}
        className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${errorMessage ? "border-neutral-700 bg-neutral-900 text-neutral-200" : "border-neutral-800 bg-neutral-900 text-neutral-300"}`}
      >
        {errorMessage || (connectionStatus === "reconnecting" ? "Reconnecting to the room…" : "Connecting to the room…")}
      </p>
    </div>
  );
}
