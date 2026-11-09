import { Disc3 } from "lucide-react";
import type { MusicTrack } from "@/shared/music";

/** Original record-sleeve artwork, not third-party album art. */
export default function MusicCover({
  track,
  large = false,
}: {
  track: MusicTrack;
  large?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`relative isolate grid aspect-square shrink-0 place-items-center overflow-hidden rounded-md ${large ? "w-full max-w-56" : "h-11 w-11"}`}
      style={{ backgroundColor: track.color }}
    >
      <div className="absolute -right-1/4 -top-1/4 h-full w-full rounded-full border-[20px] border-black/10" />
      <div className="absolute -bottom-1/3 -left-1/4 h-full w-full rounded-full border-[20px] border-white/20" />
      <Disc3
        strokeWidth={0.8}
        className={`${large ? "h-32 w-32" : "h-8 w-8"} text-neutral-950/80`}
      />
      {large && (
        <span className="absolute bottom-4 left-4 right-4 truncate text-left text-xs font-semibold tracking-widest text-neutral-950">
          {track.title.toUpperCase()}
        </span>
      )}
    </div>
  );
}
