import { X } from "lucide-react";
import type { Participant } from "@/shared/jam";
import RoomSidebar from "./RoomSidebar";

type RoomInfoDialogProps = {
  open: boolean;
  onClose: () => void;
  code: string;
  participants: Participant[];
  selfParticipantId: string | null;
};

export default function RoomInfoDialog({ open, onClose, code, participants, selfParticipantId }: RoomInfoDialogProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20 flex justify-start bg-black/60 lg:hidden" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="flex h-full w-full max-w-sm flex-col shadow-2xl" aria-label="Room details" role="dialog" aria-modal="true">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4">
          <h2 className="text-sm font-semibold text-white">Room details</h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-neutral-400 hover:bg-neutral-900 hover:text-white" aria-label="Close room details"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1">
          <RoomSidebar code={code} participants={participants} selfParticipantId={selfParticipantId} />
        </div>
      </section>
    </div>
  );
}
