import fs from "fs";
import path from "path";
import log from "electron-log";
import playerStateStore, { PlayerState, Thumbnail, VideoState } from "../player-state-store";
import { ListeningStatsSummary } from "../../shared/types";

// Listening statistics, kept in a file on this PC only. Time counts while a song actually plays (not ads,
// not a seek), and a song counts as played once 30 seconds (or half of a short song) have been heard.

type SongStats = {
  title: string;
  author: string;
  album: string | null;
  thumbnail: string | null;
  plays: number;
  seconds: number;
  lastPlayed: number;
};

type StatsFile = {
  version: 1;
  since: number;
  totalSeconds: number;
  days: Record<string, number>;
  songs: Record<string, SongStats>;
};

const SAVE_DELAY_MS = 30 * 1000;
// Progress arrives a few times a second; a bigger jump forward is a seek, not listening
const MAX_COUNTED_STEP_SECONDS = 5;

function dayKey(time: number) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function emptyStats(): StatsFile {
  return { version: 1, since: Date.now(), totalSeconds: 0, days: {}, songs: {} };
}

function smallThumbnail(thumbnails: Thumbnail[]) {
  if (!thumbnails?.length) return null;
  const sorted = [...thumbnails].sort((a, b) => a.width - b.width);
  return (sorted.find(thumbnail => thumbnail.width >= 60) ?? sorted[sorted.length - 1]).url;
}

export default class ListeningStats {
  private readonly file: string;
  private data: StatsFile;
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private listener: ((state: PlayerState) => void) | null = null;

  // The play that is running right now
  private currentId: string | null = null;
  private lastProgress: number | null = null;
  private heardThisPlay = 0;
  private countedThisPlay = false;

  constructor(userDataPath: string) {
    this.file = path.join(userDataPath, "listening-stats.json");
    this.data = this.load();
  }

  private load(): StatsFile {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (parsed?.version === 1 && parsed.songs && parsed.days) return parsed as StatsFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") log.warn("Listening stats: could not read the file, starting fresh", error);
    }
    return emptyStats();
  }

  public enable() {
    if (this.listener) return;
    this.listener = state => this.onPlayerState(state);
    playerStateStore.addEventListener(this.listener);
  }

  public disable() {
    if (!this.listener) return;
    playerStateStore.removeEventListener(this.listener);
    this.listener = null;
    this.currentId = null;
    this.lastProgress = null;
    this.save();
  }

  private onPlayerState(state: PlayerState) {
    const details = state.videoDetails;
    if (!details?.id) return;

    if (details.id !== this.currentId) {
      this.currentId = details.id;
      this.lastProgress = state.videoProgress;
      this.heardThisPlay = 0;
      this.countedThisPlay = false;
    }

    const song = (this.data.songs[details.id] ??= {
      title: details.title,
      author: details.author,
      album: details.album,
      thumbnail: null,
      plays: 0,
      seconds: 0,
      lastPlayed: Date.now()
    });
    // The first data of a song can be incomplete, later updates fill it in
    song.title = details.title || song.title;
    song.author = details.author || song.author;
    song.album = details.album ?? song.album;
    song.thumbnail = smallThumbnail(details.thumbnails) ?? song.thumbnail;

    const playing = state.trackState === VideoState.Playing && !state.adPlaying;
    const progress = state.videoProgress;
    if (this.lastProgress !== null && playing) {
      const step = progress - this.lastProgress;
      if (step > 0 && step <= MAX_COUNTED_STEP_SECONDS) {
        const now = Date.now();
        song.seconds += step;
        song.lastPlayed = now;
        this.data.totalSeconds += step;
        const day = dayKey(now);
        this.data.days[day] = (this.data.days[day] ?? 0) + step;
        this.heardThisPlay += step;
        this.dirty = true;
      } else if (step < -MAX_COUNTED_STEP_SECONDS && progress < MAX_COUNTED_STEP_SECONDS && this.countedThisPlay) {
        // The same song again (repeat): back at the start after it was counted
        this.heardThisPlay = 0;
        this.countedThisPlay = false;
      }
    }
    this.lastProgress = progress;

    const needed = Math.min(30, (details.durationSeconds || 60) * 0.5);
    if (!this.countedThisPlay && this.heardThisPlay >= needed) {
      this.countedThisPlay = true;
      song.plays += 1;
      this.dirty = true;
    }

    this.scheduleSave();
  }

  private scheduleSave() {
    if (!this.dirty || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, SAVE_DELAY_MS);
  }

  public save() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty) return;
    try {
      const temporary = `${this.file}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(this.data));
      fs.renameSync(temporary, this.file);
      this.dirty = false;
    } catch (error) {
      log.warn("Listening stats: could not save", error);
    }
  }

  public clear() {
    this.data = emptyStats();
    this.heardThisPlay = 0;
    this.countedThisPlay = false;
    this.dirty = true;
    this.save();
  }

  public summary(now = Date.now()): ListeningStatsSummary {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const days: { date: string; seconds: number }[] = [];
    for (let offset = 13; offset >= 0; offset--) {
      const date = dayKey(today.getTime() - offset * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);
      days.push({ date, seconds: Math.round(this.data.days[date] ?? 0) });
    }

    const songs = Object.entries(this.data.songs);
    const artists = new Map<string, { name: string; plays: number; seconds: number }>();
    let totalPlays = 0;
    for (const [, song] of songs) {
      totalPlays += song.plays;
      if (!song.author) continue;
      const artist = artists.get(song.author) ?? { name: song.author, plays: 0, seconds: 0 };
      artist.plays += song.plays;
      artist.seconds += song.seconds;
      artists.set(song.author, artist);
    }

    const bySeconds = (a: { seconds: number; plays: number }, b: { seconds: number; plays: number }) => b.seconds - a.seconds || b.plays - a.plays;
    return {
      since: songs.length ? this.data.since : null,
      totalSeconds: Math.round(this.data.totalSeconds),
      todaySeconds: days[days.length - 1].seconds,
      weekSeconds: days.slice(-7).reduce((sum, day) => sum + day.seconds, 0),
      totalPlays,
      days,
      topSongs: songs
        .map(([videoId, song]) => ({
          videoId,
          title: song.title,
          author: song.author,
          thumbnail: song.thumbnail,
          plays: song.plays,
          seconds: Math.round(song.seconds)
        }))
        .filter(song => song.seconds >= 1)
        .sort(bySeconds)
        .slice(0, 10),
      topArtists: [...artists.values()]
        .map(artist => ({ ...artist, seconds: Math.round(artist.seconds) }))
        .filter(artist => artist.seconds >= 1)
        .sort(bySeconds)
        .slice(0, 8)
    };
  }
}
