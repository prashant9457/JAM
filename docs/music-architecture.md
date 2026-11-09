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
4. Ten four-timestamp probes estimate clock offset using the lowest-RTT sample,
   excluding server processing time. Probes repeat every 30 seconds.
5. The shared start is at least 1.5 seconds ahead, or twice the slowest reported RTT
   plus 250 ms, whichever is longer.
6. AudioBufferSourceNode.start() schedules on AudioContext.currentTime, accounting
   for reported output latency (bounded to 250 ms). Late arrivals join the current
   shared position. A two-second drift check re-anchors differences over 80 ms.

Three decoded buffers are retained per mounted player. Track changes abort pending
downloads and stop old nodes. Pause, mode change, unmount, and disconnection stop
local audio. Only the host advances the queue after natural track endings; stopped
sources never advance it.

Bluetooth and inaccurate device latency reporting can still cause audible timing
differences; sample-accurate hardware output is not guaranteed. Test with normal
browser tabs rather than an embedded editor preview.

To add recordings, place files in `public/music/`, list metadata in
`shared/music.ts`, and update `public/music/CREDITS.md` and the UI credits for any
additional artists/licenses. The server validates music IDs against the catalog.
