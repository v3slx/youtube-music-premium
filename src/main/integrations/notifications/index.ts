import { app, Notification, NotificationConstructorOptions, nativeImage } from "electron";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import https from "https";
import log from "electron-log";
import Conf from "conf";
import playerStateStore, { PlayerState, Thumbnail, VideoDetails, VideoState } from "../../player-state-store";
import IIntegration from "../integration";
import { StoreSchema } from "~shared/store/schema";

// Visualiser - https://apps.microsoft.com/store/detail/notifications-visualizer/9NBLGGH5XSL1?hl=en-gb&gl=gb&rtc=1
// Documentation / Examples - https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/adaptive-interactive-toasts?tabs=xml

/** A thumbnail big enough to look sharp in the notification. */
function getNotificationThumbnail(thumbnails: Thumbnail[]) {
  const sorted = [...thumbnails].sort((a, b) => a.width - b.width);
  return (sorted.find(thumbnail => thumbnail.width >= 120) ?? sorted[sorted.length - 1])?.url ?? null;
}

function download(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 8000 }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Thumbnail request failed with ${response.statusCode}`));
        return;
      }
      const data: Buffer[] = [];
      response.on("data", chunk => data.push(chunk));
      response.on("end", () => resolve(Buffer.concat(data)));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Thumbnail request timed out")));
    request.on("error", reject);
  });
}

function escapeXml(text: string) {
  return text.replace(/[<>&'"]/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]);
}

function subtitleFor(details: VideoDetails) {
  const album = details.album?.trim();
  return album && album.toLowerCase() !== details.title.trim().toLowerCase() ? `${details.author} · ${album}` : details.author;
}

/**
 * A Windows toast with the album art, the song and playback buttons. The buttons open ytmd://control/... links,
 * which reach the running app like any other ytmd:// link.
 */
function buildToastXml(details: VideoDetails, imagePath: string | null, controls: boolean) {
  const image = imagePath ? `<image placement="appLogoOverride" src="${escapeXml(pathToFileURL(imagePath).href)}"/>` : "";
  const actions = controls
    ? `<actions>
        <action content="Previous" activationType="protocol" arguments="ytmd://control/previous"/>
        <action content="Pause" activationType="protocol" arguments="ytmd://control/playPause"/>
        <action content="Next" activationType="protocol" arguments="ytmd://control/next"/>
      </actions>`
    : "";
  return `<toast activationType="protocol" launch="ytmd://focus">
    <visual>
      <binding template="ToastGeneric">
        ${image}
        <text hint-maxLines="1">${escapeXml(details.title)}</text>
        <text>${escapeXml(subtitleFor(details))}</text>
      </binding>
    </visual>
    ${actions}
    <audio silent="true"/>
  </toast>`;
}

export default class NowPlayingNotifications implements IIntegration {
  private isEnabled = false;
  private lastDetails: VideoDetails = null;
  private playerStateFunction: (state: PlayerState) => void;
  private store: Conf<StoreSchema> | null = null;
  private isAppInFront: () => boolean = () => false;
  private lastCoverFile: string | null = null;

  /**
   * @param store settings (whether to show playback buttons)
   * @param isAppInFront while the app's window is in front the song is visible anyway, no notification then
   */
  public provide(store: Conf<StoreSchema>, isAppInFront: () => boolean): void {
    this.store = store;
    this.isAppInFront = isAppInFront;
  }

  /** The cover as a file: Windows toasts only show local images. A new name per song, Windows caches by path. */
  private async saveCover(details: VideoDetails, data: Buffer): Promise<string | null> {
    try {
      const file = path.join(app.getPath("temp"), `ytmd-notification-${details.id.replace(/[^\w-]/g, "")}.jpg`);
      await fs.writeFile(file, data);
      const previous = this.lastCoverFile;
      this.lastCoverFile = file;
      // The previous one is no longer shown by then
      if (previous && previous !== file) setTimeout(() => void fs.unlink(previous).catch(() => {}), 30 * 1000);
      return file;
    } catch (error) {
      log.warn("Notifications: could not save the cover", error);
      return null;
    }
  }

  private async show(details: VideoDetails) {
    const url = details.thumbnails?.length ? getNotificationThumbnail(details.thumbnails) : null;
    const data = url ? await download(url).catch((): null => null) : null;

    let notification: Notification;
    if (process.platform === "win32") {
      const coverFile = data ? await this.saveCover(details, data) : null;
      const controls = this.store?.get("general").notificationControls ?? true;
      notification = new Notification({ toastXml: buildToastXml(details, coverFile, controls) });
    } else {
      const options: NotificationConstructorOptions = {
        title: details.title,
        body: subtitleFor(details),
        silent: true,
        urgency: "low" // Linux only
      };
      if (data) options.icon = nativeImage.createFromBuffer(data);
      notification = new Notification(options);
    }

    // Windows rejects a malformed toast silently otherwise
    notification.on("failed", (_event, error) => log.warn("Notifications: Windows did not show the notification", error));
    notification.show();
    setTimeout(() => notification.close(), 6 * 1000);
  }

  private updateVideoDetails(state: PlayerState): void {
    if (!this.isEnabled) return;
    if (!state.videoDetails || state.trackState !== VideoState.Playing) return;
    // Once per song, not on every progress update
    if (this.lastDetails && this.lastDetails.id === state.videoDetails.id) return;
    this.lastDetails = state.videoDetails;
    if (this.isAppInFront()) return;

    void this.show(state.videoDetails).catch(error => log.warn("Notifications: could not show the notification", error));
  }

  public enable(): void {
    if (!this.isEnabled) {
      this.playerStateFunction = (state: PlayerState) => this.updateVideoDetails(state);
      playerStateStore.addEventListener(this.playerStateFunction);
      this.isEnabled = true;
    }
  }

  public disable(): void {
    if (this.isEnabled) {
      playerStateStore.removeEventListener(this.playerStateFunction);
      this.isEnabled = false;
    }
  }

  public getYTMScripts(): { name: string; script: string }[] {
    return [];
  }
}
