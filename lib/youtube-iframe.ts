export type YouTubePlayerState = {
  cueVideoById(
    video: string | { videoId: string; startSeconds?: number },
  ): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoLoadedFraction(): number;
  mute(): void;
  unMute(): void;
  destroy(): void;
};

type YouTubePlayerEvent = { target: YouTubePlayerState; data: number };

type YouTubePlayerOptions = {
  videoId: string;
  width: string;
  height: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady: (event: YouTubePlayerEvent) => void;
    onStateChange: (event: YouTubePlayerEvent) => void;
    onError: (event: YouTubePlayerEvent) => void;
    onAutoplayBlocked?: () => void;
  };
};

export type YouTubeIframeApi = {
  Player: new (
    element: HTMLElement,
    options: YouTubePlayerOptions,
  ) => YouTubePlayerState;
};

declare global {
  interface Window {
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeIframeApi> | null = null;

/** Load the official IFrame API once and share its promise between players. */
export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("The YouTube player is only available in a browser."),
    );
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  const pendingPromise: Promise<YouTubeIframeApi> =
    new Promise<YouTubeIframeApi>((resolve, reject) => {
      const previousReadyHandler = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReadyHandler?.();
        if (window.YT?.Player) resolve(window.YT);
        else reject(new Error("YouTube's player API did not initialize."));
      };

      let script = document.querySelector<HTMLScriptElement>(
        "script[data-jam-youtube-api]",
      );
      if (!script) {
        script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        script.dataset.jamYoutubeApi = "true";
        script.onerror = () =>
          reject(new Error("Could not load YouTube's player API."));
        document.head.appendChild(script);
      }
    }).catch((error: unknown) => {
      apiPromise = null;
      throw error;
    });

  apiPromise = pendingPromise;
  return pendingPromise;
}
