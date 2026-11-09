import type { IncomingMessage, ServerResponse } from "node:http";
import type { MusicUploadStore } from "./music-upload-store.ts";
import { RoomError } from "./room-manager.ts";
import { isAllowedOrigin } from "./socket/guards.ts";

/** Raw MP3 transfer stays on HTTP; Socket.IO only carries grants and room metadata. */
export function createMusicUploadHandler(
  store: MusicUploadStore,
  origins: string[],
) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/music/uploads/")) return false;
    const origin = request.headers.origin;
    if (origin && !isAllowedOrigin(origin, origins)) {
      response.writeHead(403).end();
      return true;
    }
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET, HEAD, PUT, OPTIONS",
    );
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return true;
    }
    const match = /^\/music\/uploads\/([a-f0-9-]{36})$/.exec(path);
    if (!match) {
      response.writeHead(404).end();
      return true;
    }
    const id = match[1];

    if (request.method === "GET" || request.method === "HEAD") {
      const bytes = store.audio(id);
      if (!bytes) {
        response.writeHead(404).end();
        return true;
      }
      response.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": bytes.length,
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
      return true;
    }
    if (request.method !== "PUT") {
      response.writeHead(405).end();
      return true;
    }
    const token = request.headers.authorization?.replace(/^Bearer /, "");
    if (!token) {
      response.writeHead(401).end();
      return true;
    }
    let receiving = false;
    try {
      const expectedSize = store.begin(id, token);
      receiving = true;
      const contentLength = request.headers["content-length"];
      if (contentLength !== undefined && Number(contentLength) !== expectedSize)
        throw new RoomError(
          "INVALID_INPUT",
          "The upload size does not match the selected file.",
        );
      const bytes = await readLimitedBody(request, expectedSize);
      store.receive(id, bytes);
      response
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ ok: true }));
    } catch (error) {
      if (receiving) store.cancel(id);
      if (!response.destroyed) {
        const message =
          error instanceof RoomError
            ? error.message
            : "The upload was interrupted. Try again.";
        response
          .writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: message }));
      }
    }
    return true;
  };
}

function readLimitedBody(
  request: IncomingMessage,
  limit: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    function cleanup() {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("aborted", onAborted);
      request.off("error", onError);
      request.off("timeout", onTimeout);
      request.setTimeout(0);
    }
    function fail(error: Error) {
      cleanup();
      // Aborted IncomingMessages may emit an error after their aborted event.
      request.once("error", () => {});
      request.resume();
      reject(error);
    }
    function onData(chunk: Buffer) {
      length += chunk.length;
      if (length > limit) {
        fail(
          new RoomError(
            "INVALID_INPUT",
            "The upload exceeds its allowed size.",
          ),
        );
        return;
      }
      chunks.push(chunk);
    }
    function onEnd() {
      cleanup();
      resolve(Buffer.concat(chunks, length));
    }
    function onAborted() {
      fail(new Error("Upload cancelled"));
    }
    function onError(error: Error) {
      fail(error);
    }
    function onTimeout() {
      fail(new Error("Upload timed out"));
    }
    request
      .on("data", onData)
      .once("end", onEnd)
      .once("aborted", onAborted)
      .once("error", onError);
    request.setTimeout(60_000, onTimeout);
  });
}
