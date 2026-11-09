# Jam music handoff — 2026-11-09

## Implemented

- Four locally bundled Creative Commons tracks and in-app credits.
- Music library search, original record sleeves, now-playing view, per-device volume,
  shared queue controls, loading/error/retry states, and separate video/music playback.
- An independent Web Audio engine and React lifecycle hook. Songs are decoded before
  readiness; normal room interactions enable audio, with a button only as fallback.
- Ten four-timestamp clock probes, RTT-aware future starts, output latency compensation,
  late-listener catch-up, drift correction, and preparation IDs for stale reports.
- Tests for audio scheduling, cache behavior, source cleanup, clock math, readiness,
  host authorization, mode switching, and queue transitions.
- A real Socket.IO integration test connects two clients and verifies readiness,
  matching scheduled starts, guest authorization, pause, and queue advancement.
- Cached buffers are held in React state so revisiting a loaded song triggers playback
  reliably. Queue mode changes preserve the previous video selection.

## Follow-up verification

- Listen in two normal browser tabs/devices and confirm audible alignment, pause/resume,
  next queued track, switching back to video, and a guest joining mid-song.
- Check narrow mobile layout and audio interruption/recovery on iOS/Android.
- Bluetooth and inaccurate hardware latency reports can still produce audible offsets.
- Live browser/audio verification has not been completed by the agent. Automated timing
  tests use a fake AudioContext; they cannot establish real speaker synchronization.

## Structure

`shared/music.ts`: catalog. `lib/music-audio.ts`: audio engine and scheduling.
`lib/realtime/clock.ts`: NTP math. `useSyncedMusicPlayer.ts`: React orchestration.
`MusicWorkspace`, `MusicTrackList`, `MusicNowPlaying`, `MusicCover`, `MusicCredits`:
separate UI concerns. `docs/music-architecture.md`: protocol and design notes.

Restart both the Next.js app and realtime server after updating; the server protocol
and room state changed. Production Next.js builds and tests are run before committing.
