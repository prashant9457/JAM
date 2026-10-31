"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import type { ChatMessage } from "@/shared/jam";

type ChatPanelProps = {
  messages: ChatMessage[];
  selfParticipantId: string | null;
  disabled: boolean;
  onSendMessage: (text: string) => Promise<boolean>;
};

export default function ChatPanel({
  messages,
  selfParticipantId,
  disabled,
  onSendMessage,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const messageListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight });
  }, [messages.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || disabled) return;

    setSending(true);
    const sent = await onSendMessage(text);
    if (sent) setDraft("");
    setSending(false);
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-neutral-800 bg-[#0b0b0b] text-neutral-300">
      <header className="flex h-12 shrink-0 items-center border-b border-neutral-800 px-4">
        <h2 className="text-sm font-medium text-neutral-100">Chat</h2>
      </header>

      <section aria-label="Chat messages" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {messages.length === 0 ? (
          <div className="m-auto px-6 text-center">
            <p className="text-sm text-neutral-500">No messages yet</p>
          </div>
        ) : (
          <ul ref={messageListRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((message) => {
              const isSelf = message.participantId === selfParticipantId;
              return (
                <li key={message.id} className={`flex flex-col gap-1 ${isSelf ? "items-end" : "items-start"}`}>
                  <div className={`flex items-baseline gap-2 ${isSelf ? "justify-end" : "justify-start"}`}>
                    <span className={`text-xs font-semibold ${isSelf ? "text-white" : "text-neutral-300"}`}>
                      {isSelf ? "You" : message.participantName}
                    </span>
                    <time className="text-[10px] text-neutral-600" dateTime={new Date(message.createdAtMs).toISOString()}>
                      {new Date(message.createdAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </div>
                  <p className={`max-w-[85%] break-words rounded-lg px-3 py-2 text-sm leading-5 ${isSelf ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-200"}`}>
                    {message.text}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form onSubmit={handleSubmit} className="shrink-0 border-t border-neutral-800 p-3">
        <label htmlFor="chat-message" className="sr-only">Write a message</label>
        <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 focus-within:border-neutral-600">
          <input
            id="chat-message"
            type="text"
            value={draft}
            maxLength={500}
            autoComplete="off"
            placeholder={disabled ? "Connecting…" : "Message the room"}
            disabled={disabled || sending}
            onChange={(event) => setDraft(event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-neutral-500 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={disabled || sending || !draft.trim()}
            aria-label="Send message"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-neutral-200 text-neutral-950 hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
          >
            <Send size={15} />
          </button>
        </div>
      </form>
    </aside>
  );
}
