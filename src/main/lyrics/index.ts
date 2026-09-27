import { app, net } from "electron";
import log from "electron-log";
import { LyricsLine, LyricsQuery, LyricsWord, SyncedLyrics } from "../../shared/types";

// Synced lyrics from two open community databases, used next to the lyrics YouTube Music has itself:
// - AMLL TTML DB (api.amll.dev): hand-timed word by word, mostly well known songs
// - LRCLIB (lrclib.net): timed line by line, a large catalogue
// Only title, artist, album and duration of the song are sent, nothing about the user.

const REQUEST_TIMEOUT_MS = 8000;
const CACHE_SIZE = 60;
const LRCLIB_API = "https://lrclib.net/api";
const AMLL_API = "https://api.amll.dev/v1/lyrics";

const cache = new Map<string, Promise<SyncedLyrics[]>>();

function userAgent() {
  return `YouTube Music Premium/${app.getVersion()} (https://github.com/v3slx/youtube-music-premium)`;
}

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await net.fetch(url, { headers: { "User-Agent": userAgent(), "Accept": "application/json" }, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    if ((error as Error)?.name !== "AbortError") log.debug(`Lyrics: request failed (${new URL(url).host})`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Matching ───────────────────────────────────────────────────────────────────────────────────────────

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** "Roller (feat. X)" -> "Roller", "Song - Remastered 2011" -> "Song" */
function cleanTitle(title: string) {
  return title
    .replace(/\s*[([](feat\.?|ft\.?|with|prod\.?)\s[^)\]]*[)\]]/gi, "")
    .replace(/\s*[([](official\s+)?(audio|video|music video|lyric video|visualizer)[)\]]/gi, "")
    .replace(/\s+-\s+(\d{4}\s+)?remaster(ed)?(\s+\d{4})?.*$/i, "")
    .trim();
}

/** "Udo Lindenberg & Apache 207" -> ["Udo Lindenberg", "Apache 207"] */
function splitArtists(artist: string) {
  return artist
    .split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|\bund\b|\band\b)\s*/i)
    .map(name => name.trim())
    .filter(Boolean);
}

function titleMatches(candidate: string, title: string) {
  const a = normalize(cleanTitle(candidate));
  const b = normalize(cleanTitle(title));
  return a === b || (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a)));
}

function artistMatches(candidates: string[], artists: string[]) {
  const wanted = artists.map(normalize);
  return candidates.some(candidate => {
    const name = normalize(candidate);
    return wanted.some(artist => artist === name || name.includes(artist) || artist.includes(name));
  });
}

// ── LRCLIB ─────────────────────────────────────────────────────────────────────────────────────────────

type LrclibRecord = {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string | null;
};

const LRC_TIME = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const LRC_WORD_TIME = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;

function lrcTime(minutes: string, seconds: string) {
  return Math.round((parseInt(minutes, 10) * 60 + parseFloat(seconds.replace(":", "."))) * 1000);
}

/** LRC, including the "enhanced" variant with <mm:ss.xx> stamps before words */
export function parseLrc(lrc: string, durationMs: number): { lines: LyricsLine[]; wordSynced: boolean } {
  const entries: { start: number; text: string; words: LyricsWord[] | null }[] = [];
  let wordSynced = false;
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(LRC_TIME)];
    if (!stamps.length) continue;
    const body = raw.slice(stamps[stamps.length - 1].index! + stamps[stamps.length - 1][0].length);

    let words: LyricsWord[] | null = null;
    const wordStamps = [...body.matchAll(LRC_WORD_TIME)];
    if (wordStamps.length > 1) {
      words = [];
      for (let index = 0; index < wordStamps.length; index++) {
        const stamp = wordStamps[index];
        const textStart = stamp.index! + stamp[0].length;
        const textEnd = index + 1 < wordStamps.length ? wordStamps[index + 1].index! : body.length;
        const text = body.slice(textStart, textEnd);
        const start = lrcTime(stamp[1], stamp[2]);
        const next = wordStamps[index + 1];
        const end = next ? lrcTime(next[1], next[2]) : start + 600;
        if (text.trim()) words.push({ text, start, end });
        else if (words.length) words[words.length - 1].end = start;
      }
      if (words.length) wordSynced = true;
      else words = null;
    }
    const text = body.replace(LRC_WORD_TIME, "").trim();
    for (const stamp of stamps) {
      const start = lrcTime(stamp[1], stamp[2]);
      // A line repeated under several stamps only has word times for its first one
      entries.push({ start, text, words: stamp === stamps[0] ? words : null });
    }
  }
  entries.sort((a, b) => a.start - b.start);

  const lines: LyricsLine[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    // An empty line only marks where the previous one ends
    if (!entry.text || entry.text === "♪") continue;
    const next = entries[index + 1];
    const end = entry.words?.length ? entry.words[entry.words.length - 1].end : next ? next.start : Math.max(entry.start + 4000, durationMs);
    lines.push({ start: entry.start, end: Math.max(end, entry.start + 200), text: entry.text, words: entry.words, background: null, alternate: false });
  }
  return { lines, wordSynced };
}

async function fromLrclib(query: LyricsQuery): Promise<SyncedLyrics | null> {
  const title = cleanTitle(query.title);
  const artists = splitArtists(query.artist);
  const duration = Math.round(query.durationSeconds);

  const usable = (record: LrclibRecord | null) =>
    !!record &&
    !record.instrumental &&
    typeof record.syncedLyrics === "string" &&
    record.syncedLyrics.includes("[") &&
    (!duration || !record.duration || Math.abs(record.duration - duration) <= 4);

  let record: LrclibRecord | null = null;
  // An exact lookup first (LRCLIB allows two seconds of difference in the duration), then a search
  const exact = new URLSearchParams({ track_name: title, artist_name: artists[0] ?? query.artist });
  if (duration) exact.set("duration", String(duration));
  const found = (await getJson(`${LRCLIB_API}/get?${exact}`)) as LrclibRecord | null;
  if (usable(found)) record = found;

  if (!record) {
    const search = new URLSearchParams({ q: `${title} ${artists[0] ?? query.artist}` });
    const results = (await getJson(`${LRCLIB_API}/search?${search}`)) as LrclibRecord[] | null;
    if (Array.isArray(results)) {
      record =
        results
          .filter(result => usable(result) && titleMatches(result.trackName ?? "", title) && artistMatches([result.artistName ?? ""], artists))
          .sort((a, b) => Math.abs((a.duration ?? 0) - duration) - Math.abs((b.duration ?? 0) - duration))[0] ?? null;
    }
  }
  if (!record?.syncedLyrics) return null;

  const { lines, wordSynced } = parseLrc(record.syncedLyrics, duration * 1000);
  return lines.length ? { source: "LRCLIB", wordSynced, lines } : null;
}

// ── AMLL TTML DB ───────────────────────────────────────────────────────────────────────────────────────

type AmllItem = { id?: number | string; filename?: string; musicNames?: string[]; artistNames?: string[] };

/** "27.173", "3:14.571" or "1:02:03.4" in milliseconds */
function ttmlTime(value: string | undefined): number | null {
  if (!value) return null;
  const parts = value.trim().replace(/s$/, "").split(":");
  let seconds = 0;
  for (const part of parts) {
    const number = parseFloat(part);
    if (!Number.isFinite(number)) return null;
    seconds = seconds * 60 + number;
  }
  return Math.round(seconds * 1000);
}

function decodeEntities(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name.replace(":", "\\:")}="([^"]*)"`));
  return match ? match[1] : undefined;
}

/**
 * The subset of TTML that Apple Music style lyrics use: <p> lines with timed <span> words, background vocals in a
 * span with ttm:role="x-bg", translations and romanizations (skipped) and ttm:agent for duets.
 */
export function parseTtml(ttml: string): { lines: LyricsLine[]; wordSynced: boolean } {
  const lines: LyricsLine[] = [];
  let wordSynced = false;
  let firstAgent: string | undefined;

  for (const paragraph of ttml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const paragraphTag = paragraph[1];
    const agent = attribute(paragraphTag, "ttm:agent");
    firstAgent ??= agent;
    const main: LyricsWord[] = [];
    const background: LyricsWord[] = [];
    let loose = "";

    // Walk the tags inside the line; the stack says what kind of span we are in
    const stack: { timed: boolean; skip: boolean; background: boolean; start: number | null; end: number | null; text: string }[] = [];
    const inside = () => stack[stack.length - 1];
    for (const token of paragraph[2].matchAll(/<span\b([^>]*)>|<\/span>|([^<]+)/g)) {
      if (token[0].startsWith("<span")) {
        const tag = token[1] ?? "";
        const role = attribute(tag, "ttm:role");
        const parent = inside();
        const start = ttmlTime(attribute(tag, "begin"));
        stack.push({
          timed: start !== null && role !== "x-bg",
          skip: (parent?.skip ?? false) || role === "x-translation" || role === "x-roman",
          background: (parent?.background ?? false) || role === "x-bg",
          start,
          end: ttmlTime(attribute(tag, "end")),
          text: ""
        });
      } else if (token[0] === "</span>") {
        const span = stack.pop();
        if (!span || span.skip || !span.timed || span.start === null) continue;
        const text = decodeEntities(span.text);
        if (!text.trim()) continue;
        const word = { text, start: span.start, end: span.end ?? span.start + 300 };
        (span.background ? background : main).push(word);
      } else {
        const text = token[2] ?? "";
        const span = inside();
        if (span && !span.skip && span.timed) span.text += text;
        else if (!span || (!span.skip && !span.timed)) {
          // Whitespace between two words belongs to the word before it
          const list = span?.background ? background : main;
          if (list.length && /^\s+$/.test(text)) list[list.length - 1].text += " ";
          else if (!span) loose += decodeEntities(text);
        }
      }
    }

    const start = ttmlTime(attribute(paragraphTag, "begin")) ?? main[0]?.start;
    const end = ttmlTime(attribute(paragraphTag, "end")) ?? main[main.length - 1]?.end;
    if (start === undefined || start === null || end === undefined || end === null) continue;
    if (main.length) wordSynced = true;
    // Background words sit in parentheses in the text; the view shows them in their own row
    for (const word of background) word.text = word.text.replace(/^\(|\)(\s*)$/g, "$1");
    const text = (main.length ? main.map(word => word.text).join("") : loose).replace(/\s+/g, " ").trim();
    if (!text && !background.length) continue;
    lines.push({
      start,
      end,
      text,
      words: main.length ? main : null,
      background: background.length ? background : null,
      alternate: !!agent && !!firstAgent && agent !== firstAgent
    });
  }
  lines.sort((a, b) => a.start - b.start);
  return { lines, wordSynced };
}

async function fromAmll(query: LyricsQuery): Promise<SyncedLyrics | null> {
  const title = cleanTitle(query.title);
  const artists = splitArtists(query.artist);
  const search = new URLSearchParams({ q: `${title} ${artists[0] ?? query.artist}`, pageSize: "5" });
  const found = (await getJson(`${AMLL_API}/search?${search}`)) as { data?: { items?: AmllItem[] } } | null;
  const items = (found?.data?.items ?? []).filter(
    item => (item.musicNames ?? []).some(name => titleMatches(name, title)) && artistMatches(item.artistNames ?? [], artists)
  );

  for (const item of items.slice(0, 2)) {
    const params = new URLSearchParams();
    if (item.filename) params.set("filename", item.filename);
    else if (item.id !== undefined) params.set("id", String(item.id));
    else continue;
    const body = (await getJson(`${AMLL_API}/get?${params}`)) as { data?: { lyrics?: string } } | null;
    const ttml = body?.data?.lyrics;
    if (typeof ttml !== "string" || !ttml.includes("<p")) continue;

    const { lines, wordSynced } = parseTtml(ttml);
    if (!lines.length) continue;
    // Another version of the song (a remix, a live recording) gives itself away by its length
    const lastEnd = lines[lines.length - 1].end;
    const duration = query.durationSeconds * 1000;
    if (duration && (lastEnd > duration + 6000 || lastEnd < duration * 0.5)) continue;
    return { source: "AMLL", wordSynced, lines };
  }
  return null;
}

// ── Public ─────────────────────────────────────────────────────────────────────────────────────────────

export function isValidLyricsQuery(value: unknown): value is LyricsQuery {
  const query = value as LyricsQuery;
  return (
    !!query &&
    typeof query.videoId === "string" &&
    typeof query.title === "string" &&
    query.title.length > 0 &&
    query.title.length < 300 &&
    typeof query.artist === "string" &&
    query.artist.length < 300 &&
    (query.album === null || typeof query.album === "string") &&
    typeof query.durationSeconds === "number" &&
    Number.isFinite(query.durationSeconds)
  );
}

/** Every source that has synced lyrics for the song, word synced ones first */
export function fetchCommunityLyrics(query: LyricsQuery): Promise<SyncedLyrics[]> {
  const key = `${query.videoId}|${query.title}|${query.artist}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = Promise.all([fromAmll(query).catch((): null => null), fromLrclib(query).catch((): null => null)]).then(results => {
    const lyrics = results.filter((result): result is SyncedLyrics => !!result);
    log.info(`Lyrics: ${lyrics.length ? lyrics.map(entry => `${entry.source}${entry.wordSynced ? " (words)" : ""}`).join(", ") : "none"} for "${query.title}"`);
    return lyrics;
  });
  cache.set(key, pending);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  // A failed lookup may work next time (offline, a timeout), so it is not kept
  void pending.then(lyrics => {
    if (!lyrics.length) cache.delete(key);
  });
  return pending;
}
