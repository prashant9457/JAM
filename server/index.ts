import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJamSocketServer } from "./socket-server.ts";

// Load optional local settings without requiring a dotenv runtime dependency.
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const host = process.env.JAM_SERVER_HOST ?? "0.0.0.0";
const port = Number(process.env.JAM_SERVER_PORT ?? 4_000);
const origins = (process.env.JAM_ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("JAM_SERVER_PORT must be a valid TCP port.");
}

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok", service: "jam-realtime" }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found" }));
});

const io = createJamSocketServer(origins);
io.attach(httpServer);

httpServer.listen(port, host, () => {
  console.info(`Jam realtime server listening at http://${host}:${port}`);
});

function shutdown(signal: string) {
  console.info(`${signal} received; closing Jam realtime server.`);
  io.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
