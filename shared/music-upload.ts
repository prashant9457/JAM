export const MAX_MP3_BYTES = 20 * 1024 * 1024;
export const MAX_ROOM_UPLOADS = 10;

export type MusicUploadGrant = {
  uploadId: string;
  uploadToken: string;
  uploadPath: string;
};

export type UploadMusic = (
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
) => Promise<void>;

export function validateMp3File(name: string, size: number): string | null {
  if (typeof name !== "string" || !/\.mp3$/i.test(name))
    return "Choose an MP3 file.";
  if (!Number.isSafeInteger(size) || size <= 0)
    return "This file is empty or invalid.";
  if (size > MAX_MP3_BYTES) return "Choose an MP3 smaller than 20 MB.";
  return null;
}
