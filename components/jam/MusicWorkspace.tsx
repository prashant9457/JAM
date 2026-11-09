"use client";

import { useState } from "react";
import { Music2, Search } from "lucide-react";
import { MUSIC_TRACKS, getMusicTrack } from "@/shared/music";
import type { PlaybackState, QueueItem } from "@/shared/jam";
import { useSyncedMusicPlayer } from "./hooks/useSyncedMusicPlayer";
import MusicCredits from "./MusicCredits";
import MusicTrackList from "./MusicTrackList";
import MusicNowPlaying from "./MusicNowPlaying";
import QueuePanel from "./QueuePanel";

type Props = {
  playback: PlaybackState;
  serverClockOffsetMs: number;
  clockRoundTripMs: number | null;
  isClockSynced: boolean;
  isHost: boolean;
  isSyncing: boolean;
  isPlaybackReady: boolean;
  readyCount: number;
  participantCount: number;
  queue: QueueItem[];
  onPlayMusic: (trackId: string) => void;
  onAddToQueue: (trackId: string, mediaType: "music" | "video") => void;
  onMoveQueueItem: (id: string, index: number) => void;
  onRemoveQueueItem: (id: string) => void;
  onPlayQueueItem: (id: string) => void;
  onPlaybackReady: (trackId: string) => void;
  onDurationChange: (seconds: number) => void;
  onEnded?: () => void;
};

export default function MusicWorkspace(props: Props) {
  const [query, setQuery] = useState("");
  const player = useSyncedMusicPlayer(props);
  const selected = getMusicTrack(props.playback.trackId);
  const tracks = MUSIC_TRACKS.filter((track) =>
    `${track.title} ${track.artist} ${track.mood}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-2">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-label="Music library" className="min-w-0">
          <div className="flex items-center gap-2 text-[#bbcf92]">
            <Music2 size={18} />
            <span className="text-sm font-medium">Jam selections</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            A little music. Everyone together.
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-neutral-400">
            Pick a track, settle in, and share the same moment.
          </p>
          <label className="mt-5 flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2.5 text-neutral-500 focus-within:border-neutral-500">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search music</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a track or a mood"
              className="w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-neutral-500"
            />
          </label>
          <div className="mt-6 flex items-center justify-between text-xs text-neutral-500">
            <h3 className="font-medium text-neutral-300">
              Made for your next jam
            </h3>
            <span>{MUSIC_TRACKS.length} tracks</span>
          </div>
          <MusicTrackList
            tracks={tracks}
            selectedId={selected?.id}
            isHost={props.isHost}
            onPlay={props.onPlayMusic}
            onAdd={props.onAddToQueue}
          />
          {tracks.length === 0 && (
            <p
              role="status"
              className="py-8 text-center text-sm text-neutral-400"
            >
              No tracks match “{query}”. Try another title or mood.
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            {props.isHost
              ? "Play a track now or add it to your shared queue."
              : "The host picks the tracks. Your volume is always yours."}
          </p>
          <div className="mt-7 max-h-64 min-h-24 overflow-y-auto border-t border-neutral-800 pt-3">
            <QueuePanel
              queue={props.queue}
              isHost={props.isHost}
              onMove={props.onMoveQueueItem}
              onRemove={props.onRemoveQueueItem}
              onPlay={props.onPlayQueueItem}
            />
          </div>
          <MusicCredits />
        </section>
        <div className="min-w-0">
          {selected ? (
            <MusicNowPlaying
              track={selected}
              player={player}
              isPlaying={props.playback.status === "playing"}
              isSyncing={props.isSyncing}
              isPlaybackReady={props.isPlaybackReady}
              isClockSynced={props.isClockSynced}
              readyCount={props.readyCount}
              participantCount={props.participantCount}
            />
          ) : (
            <p className="p-6 text-sm text-neutral-400">
              Choose a track from the library.
            </p>
          )}
          <p className="mt-3 text-center text-xs text-neutral-500">
            {props.isClockSynced
              ? `Room clock connected · ${Math.round(props.clockRoundTripMs ?? 0)} ms RTT`
              : "Connecting your room clock…"}
          </p>
        </div>
      </div>
    </div>
  );
}
