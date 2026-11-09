"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ApiResult, CreateRoomData } from "@/shared/jam";
import {
  createJamSocket,
  hostTokenStorageKey,
  waitForSocketConnection,
} from "@/lib/realtime/client";

export function useHomeRoomActions() {
  const router = useRouter();
  const [jamCode, setJamCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !/^\d{6}$/.test(jamCode)) return;
    setBusy(true);
    setErrorMessage("");

    // Room membership belongs to the room page, not a temporary homepage socket.
    router.push(`/jam/${jamCode}`);
  }

  async function createRoom() {
    if (busy) return;
    setBusy(true);
    setErrorMessage("");
    const socket = createJamSocket();

    try {
      await waitForSocketConnection(socket);
      const result = await new Promise<ApiResult<CreateRoomData>>(
        (resolve, reject) => {
          socket
            .timeout(8_000)
            .emit("room:create", (timeoutError, response) => {
              if (timeoutError)
                reject(
                  new Error("Creating a room timed out. Please try again."),
                );
              else resolve(response);
            });
        },
      );

      if (!result.ok) throw new Error(result.error.message);
      const { room, hostToken } = result.data;
      window.sessionStorage.setItem(hostTokenStorageKey(room.code), hostToken);
      socket.disconnect();
      router.push(`/jam/${room.code}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not create a room.",
      );
      socket.disconnect();
      setBusy(false);
    }
  }

  return { jamCode, setJamCode, busy, errorMessage, joinRoom, createRoom };
}
