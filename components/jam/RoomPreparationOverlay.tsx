"use client";

import { AlertCircle, LoaderCircle, Radio, Timer } from "lucide-react";

type RoomPreparationOverlayProps = {
  roundTripMs: number | null;
  playerStartupMs: number | null;
  playerLoadedSeconds: number | null;
  error: string;
  allowContinue: boolean;
  onContinue: () => void;
};

/** Keeps the room hidden until the socket clock and local YouTube player are prepared. */
export default function RoomPreparationOverlay({ roundTripMs, playerStartupMs, playerLoadedSeconds, error, allowContinue, onContinue }: RoomPreparationOverlayProps) {
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-[#0b0b0b] px-5 text-white">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <AlertCircle className="mx-auto h-8 w-8 text-neutral-300" />
        ) : (
          <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-neutral-200" />
        )}
        <h1 className="mt-5 text-lg font-semibold">{error ? "Couldn’t prepare this jam" : "Preparing your jam"}</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-400">
          {error || "Connecting your room clock and warming up the video player. This usually takes a moment."}
        </p>
        {!error && (
          <div className="mt-6 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900/70 p-4 text-left text-xs text-neutral-300">
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2"><Timer size={14} /> Room clock</span>
              <span>{roundTripMs === null ? "Measuring…" : `${Math.round(roundTripMs)} ms RTT`}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2"><Radio size={14} /> Video player</span>
              <span>{playerStartupMs === null ? "Preparing…" : `${Math.round(playerStartupMs)} ms to ready`}</span>
            </div>
            {playerLoadedSeconds !== null && (
              <div className="flex items-center justify-between gap-4 pl-5 text-neutral-500">
                <span>Estimated video data loaded</span>
                <span>{playerLoadedSeconds.toFixed(1)} sec</span>
              </div>
            )}
          </div>
        )}
        {error && <div className="mt-5 flex justify-center gap-3">
          {allowContinue && (
            <button type="button" onClick={onContinue} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200">
              Continue to room
            </button>
          )}
          <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900">
            Try again
          </button>
        </div>}
      </div>
    </div>
  );
}
