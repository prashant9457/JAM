"use client";

import type { RoomSnapshot } from "@/shared/jam";
import { validateMp3File } from "@/shared/music-upload";
import { getJamServerUrl, type JamSocket } from "./client";

/** Grant -> HTTP transfer -> publish, so incomplete files never enter the room queue. */
export async function uploadMusicFile(
  socket: JamSocket,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<RoomSnapshot> {
  const invalid = validateMp3File(file.name, file.size);
  if (invalid) throw new Error(invalid);
  if (!socket.connected)
    throw new Error("Reconnect to the room before uploading.");
  signal.throwIfAborted();
  const grantResult = await socket
    .timeout(8_000)
    .emitWithAck("music:prepare-upload", { name: file.name, size: file.size });
  if (!grantResult.ok) throw new Error(grantResult.error.message);
  const grant = grantResult.data;
  try {
    signal.throwIfAborted();
    await transferMp3(
      `${getJamServerUrl()}${grant.uploadPath}`,
      grant.uploadToken,
      file,
      onProgress,
      signal,
    );
    signal.throwIfAborted();
    if (!socket.connected)
      throw new Error("The room disconnected. Reconnect and upload again.");
    const completed = await socket
      .timeout(8_000)
      .emitWithAck("music:complete-upload", { uploadId: grant.uploadId });
    if (!completed.ok) throw new Error(completed.error.message);
    onProgress(100);
    return completed.data;
  } catch (error) {
    if (socket.connected)
      socket.emit("music:cancel-upload", { uploadId: grant.uploadId });
    throw error;
  }
}

function transferMp3(
  url: string,
  token: string,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const cancel = () => request.abort();
    const cleanup = () => signal.removeEventListener("abort", cancel);
    request.open("PUT", url);
    request.timeout = 90_000;
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("Content-Type", "audio/mpeg");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(
          Math.min(99, Math.round((event.loaded / event.total) * 100)),
        );
    };
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      let message = "The server could not accept this MP3. Try again.";
      try {
        message = JSON.parse(request.responseText).error ?? message;
      } catch {
        /* Non-JSON proxy errors use the fallback. */
      }
      reject(new Error(message));
    };
    request.onerror = () => {
      cleanup();
      reject(new Error("Upload failed. Check your connection and try again."));
    };
    request.ontimeout = () => {
      cleanup();
      reject(new Error("The upload timed out. Try a smaller file or retry."));
    };
    request.onabort = () => {
      cleanup();
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) {
      cleanup();
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    request.send(file);
  });
}
