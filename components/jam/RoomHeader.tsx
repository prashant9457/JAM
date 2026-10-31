import { Info, LogOut, MessageCircle, Radio } from "lucide-react";

type RoomHeaderProps = {
  connectionStatus: "connecting" | "connected" | "reconnecting" | "error";
  onOpenChat?: () => void;
  onOpenRoomInfo?: () => void;
  isHost?: boolean;
  onEndJam?: () => void;
};

export default function RoomHeader({
  connectionStatus,
  onOpenChat,
  onOpenRoomInfo,
  isHost,
  onEndJam,
}: RoomHeaderProps) {
  const isConnected = connectionStatus === "connected";

  return (
    <header className="flex h-full items-center gap-4 border-b border-neutral-800 bg-[#0b0b0b] px-4 text-sm text-neutral-400">
      <span className="font-semibold tracking-wide text-white">JAM</span>
      <span className="hidden text-xs text-neutral-500 sm:block">Watch YouTube videos together</span>

      <span className="ml-auto inline-flex items-center gap-2">
        {isHost && onEndJam && (
          <button type="button" onClick={onEndJam} aria-label="End Jam" title="End Jam" className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900">
            <LogOut size={14} /><span className="hidden sm:inline">End Jam</span>
          </button>
        )}
        {onOpenRoomInfo && (
          <button type="button" onClick={onOpenRoomInfo} aria-label="Open room details" className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 lg:hidden">
            <Info size={14} /><span>Room</span>
          </button>
        )}
        {onOpenChat && (
          <button type="button" onClick={onOpenChat} aria-label="Open room chat" className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 2xl:hidden">
            <MessageCircle size={14} /><span>Chat</span>
          </button>
        )}
        <Radio size={14} className={isConnected ? "text-neutral-300" : "text-neutral-500"} />
        <span className="hidden sm:inline">
          {connectionStatus === "connected" ? "Live" : connectionStatus === "error" ? "Offline" : "Connecting…"}
        </span>
      </span>
    </header>
  );
}
