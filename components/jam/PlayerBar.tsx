import { LoaderCircle, Pause, Play } from "lucide-react";

type PlayerBarProps = {
  trackSelected: boolean;
  isPlaying: boolean;
  isSyncing: boolean;
  isHost: boolean;
  positionSeconds: number;
  durationSeconds: number;
  onTogglePlayback: () => void;
};

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const remainder = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export default function PlayerBar({
  trackSelected,
  isPlaying,
  isSyncing,
  isHost,
  positionSeconds,
  durationSeconds,
  onTogglePlayback,
}: PlayerBarProps) {
  const controlDisabled = !isHost || !trackSelected || isSyncing;
  const progress = durationSeconds > 0
    ? Math.min(100, (positionSeconds / durationSeconds) * 100)
    : 0;

  return (
    <footer className="grid h-full grid-cols-1 items-center border-t border-neutral-800 bg-[#0b0b0b] px-4 text-neutral-300 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] sm:px-6">
      <div className="hidden min-w-0 sm:block">
        <p className="truncate text-sm font-medium text-neutral-200">Shared video</p>
        <p className="text-xs text-neutral-500">{isHost ? "Host" : "Only the host can play"}</p>
      </div>

      <div className="flex min-w-0 flex-col items-center gap-1.5">
        <div className="flex items-center">
          <button
            type="button"
            onClick={onTogglePlayback}
            disabled={controlDisabled}
            aria-label={isSyncing ? "Waiting for participants to sync" : isPlaying ? "Pause video for everyone" : "Play video for everyone"}
            title={!isHost ? "Only the host can control playback" : undefined}
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
          >
            {isSyncing ? <LoaderCircle className="animate-spin" size={18} /> : isPlaying ? <Pause fill="currentColor" size={18} /> : <Play fill="currentColor" size={18} />}
          </button>
        </div>

        <div className="flex w-full max-w-[680px] items-center gap-2 text-[11px] tabular-nums text-neutral-500 sm:gap-3 sm:text-xs">
          <span>{formatTime(positionSeconds)}</span>
          <div
            role="progressbar"
            aria-label="Video progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="h-1 flex-1 rounded-full bg-neutral-700"
          >
            <div className="h-full rounded-full bg-neutral-300" style={{ width: `${progress}%` }} />
          </div>
          <span>{durationSeconds > 0 ? formatTime(durationSeconds) : "--:--"}</span>
        </div>
      </div>

      <div className="hidden sm:block" aria-hidden="true" />
    </footer>
  );
}
