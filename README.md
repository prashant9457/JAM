# Jam

Jam is a room-based watch/listen room. Each browser embeds the selected YouTube video locally; the realtime server shares room membership, chat messages, and a scheduled playback timeline.

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
- New rooms currently use the YouTube video `ZTmF2v59CtI`. Every participant must click **Enable video** once so the browser can allow playback with sound. The YouTube embed must permit playback on other sites; if it does not, the room displays a link to open it on YouTube.
- Chat is room-wide, limited to 500 characters per message, and keeps the latest 100 messages in memory.
- Playback uses a server clock offset estimate, scheduled starts, and periodic drift correction. Network buffering and browser autoplay rules mean devices can still differ slightly.
- The realtime server is a separate process. In development it binds to the network interfaces and accepts loopback/private-LAN page origins. For production, configure `NEXT_PUBLIC_JAM_SERVER_URL` and `JAM_ALLOWED_ORIGINS` with the deployed realtime URL and exact site origin.

## Useful commands

- `npm run dev` — Next.js development server
- `npm run dev:server` — realtime server
- `npm run lint` — ESLint
- `npm run build` — production Next.js build
