export type WindowsEventArguments = {
  minimized: boolean;
  maximized: boolean;
  fullscreen: boolean;
};

// What the mini player shows, sent by the main process whenever it changes
export type MiniPlayerState = {
  hasVideo: boolean;
  videoId: string | null;
  title: string;
  author: string;
  album: string | null;
  thumbnail: string | null;
  durationSeconds: number;
  // Seconds into the song at progressAt (ms timestamp), so the window can count on smoothly by itself
  progress: number;
  progressAt: number;
  playing: boolean;
  // -1 unknown, 0 dislike, 1 indifferent, 2 like (LikeStatus in the player state store)
  likeStatus: number;
  isLive: boolean;
  lyricsLine: string | null;
  alwaysOnTop: boolean;
};

// Listening statistics for the settings window (kept on this PC only)
export type ListeningStatsSummary = {
  since: number | null;
  totalSeconds: number;
  todaySeconds: number;
  weekSeconds: number;
  totalPlays: number;
  days: { date: string; seconds: number }[];
  topSongs: { videoId: string; title: string; author: string; thumbnail: string | null; plays: number; seconds: number }[];
  topArtists: { name: string; plays: number; seconds: number }[];
};
