"use client";

import SpotlightCard from "@/components/ui/SpotlightCard";
import { useHomeRoomActions } from "./useHomeRoomActions";

export default function HomePage() {
  const { jamCode, setJamCode, busy, errorMessage, joinRoom, createRoom } = useHomeRoomActions();

  return (
    <main className="grid min-h-dvh place-items-center bg-[#0b0b0b] px-4 py-10 text-white">
      <SpotlightCard className="w-full max-w-sm rounded-xl border border-neutral-800 bg-[#121212] p-7 sm:p-8" intensity={0.025} borderGlow={0.05} spotlightSize={320} flare={false}>
        <div className="mb-8">
          <p className="mb-7 text-sm font-semibold tracking-wide text-neutral-300">JAM</p>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">Listen together</h1>
          <p className="text-sm text-neutral-400">Create a room or join with a code.</p>
        </div>

        <form onSubmit={joinRoom} className="space-y-4">
          <label htmlFor="room-code" className="sr-only">Six-digit room code</label>
          <input
            id="room-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Enter 6-digit room code"
            value={jamCode}
            maxLength={6}
            onChange={(event) => setJamCode(event.target.value.replace(/\D/g, ""))}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-500 focus:border-neutral-400"
          />

          <button
            type="submit"
            disabled={busy || jamCode.length !== 6}
            className="w-full rounded-md bg-neutral-200 py-3 text-sm font-semibold text-neutral-950 hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {busy ? "Connecting…" : "Join Room"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-neutral-800" />
          <span className="text-xs text-neutral-500">OR</span>
          <div className="h-px flex-1 bg-neutral-800" />
        </div>

        <button
          type="button"
          onClick={createRoom}
          disabled={busy}
          className="w-full rounded-md border border-neutral-700 py-3 text-sm font-semibold hover:bg-neutral-900 disabled:cursor-wait disabled:opacity-60"
        >
          Create a Jam
        </button>

        {errorMessage && (
          <p role="alert" className="mt-4 rounded-md border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-200">
            {errorMessage}
          </p>
        )}
      </SpotlightCard>
    </main>
  );
}
