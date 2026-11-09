# Music playback

Music mode uses bundled MP3 files and Web Audio. Video mode uses YouTube. No audio
is extracted from YouTube.

This independently written implementation is informed by the architecture in
[BeatSync](https://github.com/freeman-jiang/beatsync), especially
`apps/client/src/utils/ntp.ts`, `apps/client/src/store/global.tsx`, and
`apps/client/src/lib/audioContextManager.ts` (reviewed 2026-11-08).
No BeatSync source code is vendored.

1. The host chooses a library track or starts a queue item.
2. Every browser downloads and decodes the recording. Ordinary in-room interactions
   resume AudioContext automatically; Enable audio is a fallback for browser policy.
3. A listener reports ready only with decoded audio, a running context, a connected
   session, and a synchronized clock. The server waits for everyone. Load failures
   offer Retry. Every preparation round has an ID to reject stale readiness reports.
4. Ten four-timestamp probes estimate clock offset, excluding server processing time.
   A rolling 60-sample window keeps the lowest-RTT estimate so a congested refresh
   does not suddenly move the clock. Probes repeat every 30 seconds.
5. The shared start is at least 1.5 seconds ahead, or twice the slowest reported RTT
   plus 250 ms, whichever is longer.
6. AudioBufferSourceNode.start() schedules on AudioContext.currentTime. Output
   latency reports above 100 ms are ignored as unreliable, following BeatSync's
   conservative filtering. Late arrivals join the current shared position. Clock
   refreshes and duplicate room updates preserve the running source. Drift checks
   adjust playback rate by at most 0.5%; a hard re-anchor requires three consecutive
   differences over 500 ms. Completed timelines advance the queue only once.

Three decoded buffers are retained per mounted player. Track changes abort pending
downloads and stop old nodes. Pause, mode change, unmount, and disconnection stop
local audio. Only the host advances the queue after natural track endings; stopped
sources never advance it.

Bluetooth and inaccurate device latency reporting can still cause audible timing
differences; sample-accurate hardware output is not guaranteed. Test with normal
browser tabs rather than an embedded editor preview.

## Connection lifecycle

Room membership is created on the room page only. A random guest resume credential
is retained in sessionStorage and hashed on the server; reconnects replace the old
socket for that identity instead of adding another participant. Hosts similarly keep
one identity across reconnects. Repeated joins are idempotent. Replaced sockets lose
room authorization before disconnecting, so their delayed disconnect cannot remove
the current participant. Separate browser sessions still count as separate guests.

Snapshots carry increasing revisions, preventing delayed acknowledgements from
resurrecting old participants or playback state. Clock/join callbacks are scoped to
the current connection generation and cannot revive state after cleanup/disconnect.

To add recordings, place files in `public/music/`, list metadata in
`shared/music.ts`, and update `public/music/CREDITS.md` and the UI credits for any
additional artists/licenses. The server validates music IDs against the room catalog.

## Room MP3 uploads

The host's Upload MP3 button follows the prepare/transfer/publish structure used by
BeatSync. BeatSync transfers directly to R2; Jam uses bounded temporary storage in
the realtime server so the existing Render deployment needs no storage credentials.

- `music:prepare-upload` validates host membership, filename, size, and reserved
  storage capacity. It returns a short-lived, one-use bearer upload URL.
- `PUT /music/uploads/:id` accepts the raw MP3 (20 MB maximum). Actual byte count
  and recognizable MPEG Layer III frames are checked. Unfinished files are not
  downloadable or included in the room snapshot.
- `music:complete-upload` verifies ownership, publishes metadata, appends to the
  queue, and broadcasts the updated room catalog. Repeating completion is idempotent.
- `GET /music/uploads/:id` serves published audio with CORS for allowed site origins.
  Listeners fetch it from the realtime origin and use the same decoded-buffer sync
  pipeline as bundled songs. The unpredictable URL is an audio access capability.
- Cancellation and five-minute grant expiry release reserved capacity. Closing or
  expiring rooms releases their bytes on the next cleanup tick. Restarts clear all
  uploads. Limits are 10 tracks / 60 MB per room and 128 MB globally, including pending
  reservations, to keep memory bounded on a small Render instance.

Storage, HTTP transfer, socket authorization, browser transfer, and the upload UI are
separate modules. User-uploaded recordings are never added to Git or attributed to
the bundled tracks' artist.
