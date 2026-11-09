"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Play, Trash2 } from "lucide-react";
import type { QueueItem } from "@/shared/jam";
import { getMusicTrack, MUSIC_TRACKS, type MusicTrack } from "@/shared/music";
import MusicCover from "./MusicCover";

type QueuePanelProps = {
  musicTracks?: readonly MusicTrack[];
  queue: QueueItem[];
  isHost: boolean;
  onMove: (itemId: string, toIndex: number) => void;
  onRemove: (itemId: string) => void;
  onPlay: (itemId: string) => void;
};

export default function QueuePanel({
  musicTracks = MUSIC_TRACKS,
  queue,
  isHost,
  onMove,
  onRemove,
  onPlay,
}: QueuePanelProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-col px-1 lg:px-2"
      aria-label="Playback queue"
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-100">Queue</h2>
        <span className="text-xs text-neutral-500">{queue.length} up next</span>
      </header>

      {queue.length === 0 ? (
        <p className="py-4 text-sm text-neutral-500">
          Videos and music you add will appear here.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto py-2">
          {queue.map((item, index) => (
            <li
              key={item.id}
              draggable={isHost}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", item.id);
                event.dataTransfer.effectAllowed = "move";
                setDraggedId(item.id);
              }}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const movedId = event.dataTransfer.getData("text/plain");
                if (movedId && movedId !== item.id) onMove(movedId, index);
                setDraggedId(null);
              }}
              className={`group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-neutral-900 ${draggedId === item.id ? "opacity-40" : ""}`}
            >
              <span className="w-5 shrink-0 text-center text-xs tabular-nums text-neutral-500">
                {index + 1}
              </span>
              {item.mediaType === "music" &&
              getMusicTrack(item.trackId, musicTracks) ? (
                <MusicCover track={getMusicTrack(item.trackId, musicTracks)!} />
              ) : (
                <div
                  aria-hidden="true"
                  className="h-10 w-14 shrink-0 rounded-sm bg-neutral-800 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(https://i.ytimg.com/vi/${item.trackId}/mqdefault.jpg)`,
                  }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-200">
                  {item.mediaType === "music"
                    ? (getMusicTrack(item.trackId, musicTracks)?.title ??
                      "Music")
                    : "YouTube video"}
                </p>
                <p className="truncate text-[11px] text-neutral-500">
                  {item.mediaType === "music"
                    ? getMusicTrack(item.trackId, musicTracks)?.artist
                    : item.trackId}
                </p>
              </div>
              {isHost && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => onPlay(item.id)}
                    aria-label={`Play queue item ${index + 1}`}
                    title="Play now"
                    className="rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                  >
                    <Play size={14} fill="currentColor" />
                  </button>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMove(item.id, index - 1)}
                    aria-label={`Move item ${index + 1} up`}
                    title="Move up"
                    className="rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={index === queue.length - 1}
                    onClick={() => onMove(item.id, index + 1)}
                    aria-label={`Move item ${index + 1} down`}
                    title="Move down"
                    className="rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    aria-label={`Remove queue item ${index + 1}`}
                    title="Remove"
                    className="rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                  >
                    <Trash2 size={14} />
                  </button>
                  <span
                    className="hidden cursor-grab px-1 text-neutral-600 lg:inline-flex"
                    aria-hidden="true"
                    title="Drag to reorder"
                  >
                    <GripVertical size={15} />
                  </span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {!isHost && queue.length > 0 && (
        <p className="shrink-0 py-2 text-xs text-neutral-600">
          Only the host can edit the queue.
        </p>
      )}
    </aside>
  );
}
