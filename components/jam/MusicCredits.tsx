import { MUSIC_TRACKS } from "@/shared/music";

export default function MusicCredits() {
  return (
    <details className="mt-6 text-xs text-neutral-500">
      <summary className="cursor-pointer text-neutral-400 hover:text-white">
        Music credits & licenses
      </summary>
      <p className="mt-3 leading-5">
        Default music by Kevin MacLeod (
        <a
          href="https://incompetech.com"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          incompetech.com
        </a>
        ), licensed under{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Creative Commons Attribution 4.0
        </a>
        . Original recordings; no edits.
      </p>
      <ul className="mt-2 space-y-1">
        {MUSIC_TRACKS.map((track) => (
          <li key={track.id}>
            <a
              href={track.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-white"
            >
              {track.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
