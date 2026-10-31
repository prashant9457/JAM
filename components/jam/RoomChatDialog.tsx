import { X } from "lucide-react";
import type { ChatMessage } from "@/shared/jam";
import ChatPanel from "./ChatPanel";

type RoomChatDialogProps = {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  selfParticipantId: string | null;
  disabled: boolean;
  onSendMessage: (text: string) => Promise<boolean>;
};

export default function RoomChatDialog({ open, onClose, messages, selfParticipantId, disabled, onSendMessage }: RoomChatDialogProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/60 2xl:hidden" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="flex h-full w-full max-w-sm flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl" aria-label="Room chat" role="dialog" aria-modal="true">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-800 px-4">
          <h2 className="text-sm font-semibold text-white">Room chat</h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-neutral-400 hover:bg-neutral-900 hover:text-white" aria-label="Close chat"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1">
          <ChatPanel messages={messages} selfParticipantId={selfParticipantId} disabled={disabled} onSendMessage={onSendMessage} />
        </div>
      </section>
    </div>
  );
}
