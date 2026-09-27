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

// Synced lyrics in one shape for every source. Times are milliseconds into the song.
export type LyricsWord = {
  // Includes the space after the word, so the words of a line join back into its text
  text: string;
  start: number;
  end: number;
};

export type LyricsLine = {
  start: number;
  end: number;
  text: string;
  // Timed words when the source has them, otherwise null (the lyrics view can estimate them)
  words: LyricsWord[] | null;
  // Background vocals sung along with the line
  background: LyricsWord[] | null;
  // A second singer in a duet, shown on the other side
  alternate: boolean;
};

export type LyricsSource = "YouTube" | "LRCLIB" | "AMLL";

export type SyncedLyrics = {
  source: LyricsSource;
  wordSynced: boolean;
  lines: LyricsLine[];
};

export type LyricsQuery = {
  videoId: string;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number;
};
