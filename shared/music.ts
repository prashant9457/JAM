export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  mood: string;
  color: string;
  src: string;
  sourceUrl: string;
  isUpload?: boolean;
};

/** Local audio, served identically to every listener. See public/music/CREDITS.md. */
export const MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    id: "music-carefree",
    title: "Carefree",
    artist: "Kevin MacLeod",
    mood: "Bright · Acoustic",
    color: "#bbcf92",
    src: "/music/carefree.mp3",
    sourceUrl:
      "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037",
  },
  {
    id: "music-dream-culture",
    title: "Dream Culture",
    artist: "Kevin MacLeod",
    mood: "Dreamy · Ambient",
    color: "#b5b6d8",
    src: "/music/dream-culture.mp3",
    sourceUrl:
      "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1300046",
  },
  {
    id: "music-easy-lemon",
    title: "Easy Lemon",
    artist: "Kevin MacLeod",
    mood: "Easygoing · Instrumental",
    color: "#e3c777",
    src: "/music/easy-lemon.mp3",
    sourceUrl:
      "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1200076",
  },
  {
    id: "music-clear-air",
    title: "Clear Air",
    artist: "Kevin MacLeod",
    mood: "Calm · Atmospheric",
    color: "#8cbfc1",
    src: "/music/clear-air.mp3",
    sourceUrl:
      "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100626",
  },
];

export const DEFAULT_MUSIC_ID = MUSIC_TRACKS[0].id;
export function getMusicTrack(
  id: string | null | undefined,
  tracks: readonly MusicTrack[] = MUSIC_TRACKS,
): MusicTrack | undefined {
  return tracks.find((track) => track.id === id);
}
