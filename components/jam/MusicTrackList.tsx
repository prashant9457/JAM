"use client";

import { useState } from "react";
import { Check, Play, Plus } from "lucide-react";
import type { MusicTrack } from "@/shared/music";
import MusicCover from "./MusicCover";

type Props = {
  tracks: readonly MusicTrack[];
  selectedId?: string;
  isHost: boolean;
  onPlay: (trackId: string) => void;
  onAdd: (trackId: string, mediaType: "music") => void;
};

export default function MusicTrackList({
  tracks,
  selectedId,
  isHost,
  onPlay,
  onAdd,
}: Props) {
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  return (
    <ol className="mt-2 space-y-1">
      {tracks.map((track) => {
        const active = selectedId === track.id;
        return (
          <li
            key={track.id}
            className={`group flex min-w-0 items-center gap-3 rounded-lg p-3 ${active ? "bg-neutral-800/60" : "hover:bg-neutral-900"}`}
          >
            <MusicCover track={track} />
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-medium ${active ? "text-[#bbcf92]" : "text-neutral-100"}`}
              >
                {track.title}
              </p>
              <p className="mt-1 truncate text-xs text-neutral-400">
                {track.artist}
                <span className="hidden 2xl:inline"> · {track.mood}</span>
              </p>
            </div>
            <button
              type="button"
              disabled={!isHost}
              onClick={() => {
                onAdd(track.id, "music");
                setLastAdded(track.id);
              }}
              aria-label={`Add ${track.title} to queue`}
              title="Add to queue"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-700 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              {lastAdded === track.id ? (
                <Check size={17} />
              ) : (
                <Plus size={17} />
              )}
            </button>
            <button
              type="button"
              disabled={!isHost}
              onClick={() => onPlay(track.id)}
              aria-label={`Play ${track.title} for everyone`}
              title={
                isHost ? "Play for everyone" : "The host chooses the music"
              }
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-neutral-700 text-neutral-200 hover:border-[#bbcf92] hover:bg-[#bbcf92] hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Play size={14} fill="currentColor" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
