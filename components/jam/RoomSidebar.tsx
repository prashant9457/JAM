"use client";

import { useState } from "react";
import { Check, Copy, Crown, UsersRound } from "lucide-react";
import type { Participant } from "@/shared/jam";

type RoomSidebarProps = {
  code: string;
  participants: Participant[];
  selfParticipantId: string | null;
};

export default function RoomSidebar({
  code,
  participants,
  selfParticipantId,
}: RoomSidebarProps) {
  const [copyMessage, setCopyMessage] = useState("");

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyMessage("Invite link copied");
    } catch {
      setCopyMessage("Clipboard access is unavailable");
    }
  }

  return (
    <aside className="flex min-h-0 flex-col border-r border-neutral-800 bg-[#0b0b0b] text-neutral-300">
      <section className="flex items-center justify-between border-b border-neutral-800 px-4 py-4">
        <div>
          <p className="text-xs text-neutral-500">Room code</p>
          <h1 className="mt-1 font-mono text-lg font-semibold tracking-wide text-white">{code}</h1>
        </div>
        <button
          type="button"
          onClick={copyInviteLink}
          className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-900"
        >
          <span className="inline-flex items-center gap-1.5">
            {copyMessage ? <Check size={14} /> : <Copy size={14} />}
            {copyMessage || "Copy invite"}
          </span>
        </button>
      </section>

      <section className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between border-b border-neutral-800 pb-3">
          <h2 className="inline-flex items-center gap-2 text-sm font-medium text-neutral-200">
            <UsersRound size={15} /> Members
          </h2>
          <span className="text-xs text-neutral-500">{participants.length}/16</span>
        </div>

        <ul className="space-y-2">
          {participants.map((participant) => {
            const isSelf = participant.id === selfParticipantId;
            return (
              <li
                key={participant.id}
                className={`flex items-center gap-3 rounded-lg px-2 py-2 ${
                  isSelf ? "bg-neutral-800/80" : "hover:bg-neutral-900"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center rounded-full bg-neutral-800 text-sm text-neutral-300"
                >
                  {participant.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                  {participant.name}
                </span>
                {participant.isHost && <Crown size={14} className="text-neutral-400" aria-label="Host" />}
                {isSelf && (
                  <span className="rounded bg-neutral-700 px-2 py-1 text-[11px] text-neutral-200">
                    You
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

    </aside>
  );
}
