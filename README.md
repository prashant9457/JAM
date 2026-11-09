# Jam

Jam is a room-based watch/listen room. Video uses YouTube; music uses bundled audio and a synchronized Web Audio player. The realtime server shares room membership, chat, the queue, and scheduled playback.

## Requirements

- Node.js 22.6 or newer
- npm

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` if you need to change the local server address or allowed origins.
3. Start the realtime server in one terminal: `npm run dev:server`.
4. Start Next.js in another terminal: `npm run dev`.
5. Open `http://localhost:3000` in two browser windows to try creating and joining a room. For a phone on the same Wi-Fi, use the computer's Next.js Network URL.

The realtime server exposes a health check at `http://127.0.0.1:4000/health`.

## Project structure

```text
app/                          Next.js routes, layouts, and global styles
components/ui/                Reusable visual components
components/home/              Home screen and room create/join actions
components/jam/               Room UI, dialogs, and room-specific hooks
lib/realtime/                 Browser Socket.IO client and clock helpers
lib/                          YouTube player and URL utilities
server/index.ts               Realtime server process entry point
server/socket/                Socket.IO event handlers and shared guards
server/room-manager.ts        In-memory room domain and playback state
shared/jam.ts                Client/server room and Socket.IO contracts
```

## First-version boundaries

- Room state is held in memory and is lost when the realtime server restarts.
- Empty rooms expire after two hours; active rooms allow up to 16 participants. The server caps its in-memory room count at 10,000.
- A random host credential is returned only to the creator, stored as a SHA-256 digest by the server, and retained in that browser's session storage so the host can reconnect. The room code alone does not grant playback control.
- New rooms use the YouTube video `1E-JAofFdVQ`. Playback prompts stay inside the room. The YouTube embed must permit playback on other sites; otherwise the room displays an external link.
- Music mode includes four Kevin MacLeod tracks, with credits in the library and `public/music/CREDITS.md`. The host can play tracks, add to the shared queue, and reorder/remove items. Each listener controls their own volume. Normal room interactions enable audio where the browser allows it; an Enable audio button is the fallback.
- Music starts after every connected listener has decoded the selected track and enabled audio. Ten NTP-style clock probes, RTT-aware scheduling, audio-clock starts, output latency compensation, and drift correction align playback. See `docs/music-architecture.md`.
- Chat is room-wide, limited to 500 characters per message, and keeps the latest 100 messages in memory.
- Playback uses a server clock offset estimate, scheduled starts, and periodic drift correction. Network buffering and browser autoplay rules mean devices can still differ slightly.
- The realtime server is a separate process. In development it binds to the network interfaces and accepts loopback/private-LAN page origins. For production, configure `NEXT_PUBLIC_JAM_SERVER_URL` and `JAM_ALLOWED_ORIGINS` with the deployed realtime URL and exact site origin.

## Useful commands

- `npm run dev` — Next.js development server
- `npm run dev:server` — realtime server
- `npm run lint` — ESLint
- `npm run build` — production Next.js build

## Production deployment

Deploy the Next.js app and realtime server as separate services. For example, use Vercel for the Next.js app and a Node web service such as Render for the Socket.IO server.

### Realtime service

- Use Node.js 22.6 or newer.
- Build command: `npm ci`
- Start command: `npm run start:server`
- Health check path: `/health`
- Set `JAM_ALLOWED_ORIGINS` to the exact HTTPS origin of the deployed website. Add custom domains as comma-separated origins when needed.
- The server reads the host-provided `PORT`; `JAM_SERVER_PORT` remains the local development override.

### Next.js app

- Set `NEXT_PUBLIC_JAM_SERVER_URL` to the realtime service's HTTPS URL, such as `https://jam-realtime.onrender.com`.
- Deploy the Next.js app with its standard build and start commands.

Room state is in memory. Run one realtime server instance for now; restarts end active rooms, and multiple instances would not share room state.
