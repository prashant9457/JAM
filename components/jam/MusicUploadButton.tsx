"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Upload, X } from "lucide-react";
import { validateMp3File, type UploadMusic } from "@/shared/music-upload";

export default function MusicUploadButton({
  disabled,
  onUpload,
}: {
  disabled: boolean;
  onUpload: UploadMusic;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [],
  );

  async function upload(file: File) {
    const invalid = validateMp3File(file.name, file.size);
    setMessage("");
    setError(invalid ?? "");
    if (invalid) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setProgress(0);
    try {
      await onUpload(file, setProgress, controller.signal);
      if (!controller.signal.aborted)
        setMessage(`${file.name} added to your library and queue.`);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not upload this song.",
        );
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="mt-4">
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        className="sr-only"
        aria-label="Choose an MP3 to upload"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-white hover:border-neutral-500 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}
          {busy ? `Uploading ${progress}%` : "Upload MP3"}
        </button>
        {busy ? (
          <button
            type="button"
            onClick={() => controllerRef.current?.abort()}
            className="inline-flex min-h-11 items-center gap-1 text-xs text-neutral-400 hover:text-white"
          >
            <X size={14} /> Cancel
          </button>
        ) : (
          <span className="text-xs text-neutral-500">
            {disabled
              ? "Only the host can upload"
              : "Up to 20 MB · Shared with this room"}
          </span>
        )}
      </div>
      {busy && (
        <progress
          aria-label="MP3 upload progress"
          value={progress}
          max={100}
          className="mt-3 h-1 w-full accent-[#bbcf92]"
        />
      )}
      {message && (
        <p role="status" className="mt-2 text-xs leading-5 text-[#bbcf92]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs leading-5 text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
