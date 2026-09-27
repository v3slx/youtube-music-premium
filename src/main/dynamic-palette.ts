import { nativeImage } from "electron";
import https from "https";
import log from "electron-log";
import { Thumbnail } from "./player-state-store";
import { ThemePalette } from "../shared/store/schema";

// The dynamic theme: a dark palette tinted with the most characteristic colour of the album art.
// Only the thumbnail's pixels are used, nothing is sent anywhere.

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function download(url: string, redirects = 2): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 8000 }, response => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
        response.resume();
        resolve(download(new URL(response.headers.location, url).toString(), redirects - 1));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Album art request failed with ${response.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) {
          request.destroy(new Error("Album art too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Album art request timed out")));
    request.on("error", reject);
  });
}

/** A small thumbnail is plenty for colours and cheap to download. */
export function pickSmallThumbnail(thumbnails: Thumbnail[]): string | null {
  if (!thumbnails?.length) return null;
  const sorted = [...thumbnails].sort((a, b) => a.width - b.width);
  return (sorted.find(thumbnail => thumbnail.width >= 60) ?? sorted[sorted.length - 1]).url;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function rgbToHsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/**
 * The dominant vivid hue of an image: pixels vote for their hue weighted by how colourful and how bright they
 * are, so a black background or white text doesn't decide the colour. Greyscale art gets a neutral palette.
 */
export function dominantHue(bgra: Buffer): { hue: number; saturation: number } {
  const bins = new Array(36).fill(0);
  const hueSum = new Array(36).fill(0);
  const satSum = new Array(36).fill(0);
  let total = 0;
  for (let i = 0; i + 3 < bgra.length; i += 4) {
    const { h, s, v } = rgbToHsv(bgra[i + 2] / 255, bgra[i + 1] / 255, bgra[i] / 255);
    if (v < 0.15 || v > 0.97) continue;
    const weight = s * s * v;
    const bin = Math.min(35, Math.floor(h / 10));
    bins[bin] += weight;
    hueSum[bin] += h * weight;
    satSum[bin] += s * weight;
    total += weight;
  }
  let best = 0;
  for (let bin = 1; bin < 36; bin++) if (bins[bin] > bins[best]) best = bin;
  if (total === 0 || bins[best] === 0) return { hue: 0, saturation: 0 };
  return { hue: hueSum[best] / bins[best], saturation: satSum[best] / bins[best] };
}

export function paletteFromHue(hue: number, saturation: number): ThemePalette {
  // Nearly grey art gets a nearly grey theme
  const tint = saturation < 0.12 ? 0.04 : Math.min(0.38, Math.max(0.14, saturation * 0.45));
  return {
    background: hslToHex(hue, tint, 0.075),
    surface: hslToHex(hue, tint, 0.115),
    raised: hslToHex(hue, tint, 0.155),
    highlight: hslToHex(hue, tint, 0.2),
    text: hslToHex(hue, Math.min(tint, 0.25), 0.94),
    accent: hslToHex(hue, saturation < 0.12 ? 0.1 : Math.min(0.75, Math.max(0.45, saturation)), 0.7)
  };
}

export async function paletteFromThumbnails(thumbnails: Thumbnail[]): Promise<ThemePalette | null> {
  const url = pickSmallThumbnail(thumbnails);
  if (!url) return null;
  try {
    const image = nativeImage.createFromBuffer(await download(url));
    if (image.isEmpty()) return null;
    const { hue, saturation } = dominantHue(image.resize({ width: 24, height: 24, quality: "good" }).toBitmap());
    return paletteFromHue(hue, saturation);
  } catch (error) {
    log.warn("Dynamic theme: could not read the album art", error);
    return null;
  }
}
