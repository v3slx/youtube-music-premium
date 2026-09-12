import playerStateStore, { PlayerState, Thumbnail, VideoDetails, VideoState } from "../../player-state-store";
import IIntegration from "../integration";
import MemoryStore from "../../memory-store";
import { MemoryStoreSchema, StoreSchema } from "~shared/store/schema";
import DiscordClient from "./minimal-discord-client";
import log from "electron-log";
import { DiscordActivityType } from "./minimal-discord-client/types";
import Conf from "conf";

const DEFAULT_DISCORD_CLIENT_ID = "1548008608577364078";

function resolveClientId(configuredClientId: string | undefined): string {
  const clientId = (configuredClientId ?? "").trim();
  // Discord application IDs are snowflakes, anything else would make every connection attempt fail
  return /^\d{17,20}$/.test(clientId) ? clientId : DEFAULT_DISCORD_CLIENT_ID;
}

function getHighestResThumbnail(thumbnails: Thumbnail[]): string {
  return thumbnails.reduce(
    (accumulator, current) => (current.height * current.width <= accumulator.height * accumulator.width ? accumulator : current),
    thumbnails[0]
  ).url;
}

function getSmallImageText(state: VideoState) {
  switch (state) {
    case VideoState.Playing: {
      return "Playing";
    }
    default: {
      return "Paused";
    }
  }
}

function stringLimit(str: string, limit: number, minimum: number) {
  if (str.length > limit) {
    return str.substring(0, limit - 3).trim() + "...";
  }
  if (str.length < minimum) {
    return str.padEnd(minimum, "​"); // There's a zero width space here
  }
  return str;
}

export default class DiscordPresence implements IIntegration {
  private store: Conf<StoreSchema>;
  private memoryStore: MemoryStore<MemoryStoreSchema>;

  private discordClient: DiscordClient = null;
  private enabled = false;
  private ready = false;
  private activityDebounceTimeout: NodeJS.Timeout | null = null;
  private pauseTimeout: string | number | NodeJS.Timeout = null;
  private connectionRetryTimeout: string | number | NodeJS.Timeout = null;
  private stateCallback: (event: PlayerState) => void = null;

  private videoState: VideoState | null = null;
  private videoDetails: Partial<VideoDetails> | null = null;
  private progress: number | null = null;

  private connectionRetries: number = 0;

  private UpdateActivity() {
    if (this.activityDebounceTimeout) return;
    this.activityDebounceTimeout = setTimeout(() => {
      if (!this.videoDetails) {
        this.discordClient.clearActivity();
        return;
      }
      const { title, author, album, id, thumbnails, durationSeconds, channelId, albumId } = this.videoDetails;
      const thumbnail = getHighestResThumbnail(thumbnails);
      // Discord shows large_text as an extra line below the artist, singles would show their title twice
      const showAlbum = album && album.trim().toLowerCase() !== title.trim().toLowerCase();
      this.discordClient.setActivity({
        type: DiscordActivityType.Listening,
        status_display_type: 1,
        details: stringLimit(title, 128, 2),
        details_url: `https://music.youtube.com/watch?v=${id}`,
        state: stringLimit(author, 128, 2),
        state_url: `https://music.youtube.com/channel/${channelId}`,
        timestamps: {
          start: this.videoState === VideoState.Playing ? Date.now() - this.progress * 1000 : undefined,
          end: this.videoState === VideoState.Playing ? Date.now() + (durationSeconds - this.progress) * 1000 : undefined
        },
        assets: {
          large_image: (thumbnail?.length ?? 0) <= 256 ? thumbnail : undefined,
          large_text: showAlbum ? stringLimit(album, 128, 2) : undefined,
          large_url: albumId ? `https://music.youtube.com/browse/${albumId}` : undefined,
          // No small image: art assets would have to be uploaded to the configured Discord application
          small_image: undefined,
          small_text: getSmallImageText(this.videoState)
        },
        instance: false,
        // Discord allows at most 2 buttons with labels up to 32 characters
        buttons: [
          {
            // Works for everyone viewing the status, the app link only works with this app installed
            label: "Auf YouTube Music anhören",
            url: `https://music.youtube.com/watch?v=${id}`
          },
          {
            label: "In der App öffnen",
            url: `ytmd://play/${id}`
          }
        ]
      });
      this.activityDebounceTimeout = null;
    }, 1000);
  }

  private playerStateChanged(state: PlayerState) {
    if (!this.ready) return;

    const { videoDetails, videoProgress, trackState, hasFullMetadata } = state;
    if (!videoDetails) {
      this.discordClient.clearActivity();
      return;
    }
    const oldState = this.videoState ?? null;
    const oldId = this.videoDetails?.id ?? null;
    const oldProgress = this.progress ?? null;
    this.videoState = trackState;
    this.videoDetails = videoDetails;
    this.progress = Math.floor(videoProgress);
    if (
      hasFullMetadata &&
      (oldState !== this.videoState || oldId !== this.videoDetails.id || Math.abs(this.progress - oldProgress) > 1 || oldProgress > this.progress)
    ) {
      this.UpdateActivity();
    }

    clearTimeout(this.pauseTimeout);
    this.pauseTimeout = null;
    if (state.trackState == VideoState.Playing) return;
    this.pauseTimeout = setTimeout(() => {
      if (!this.discordClient && !this.ready) return;
      this.discordClient.clearActivity();
      this.pauseTimeout = null;
    }, 30 * 1000);
  }

  public provide(store: Conf<StoreSchema>, memoryStore: MemoryStore<MemoryStoreSchema>): void {
    this.store = store;
    this.memoryStore = memoryStore;
  }

  private retryDiscordConnection() {
    if (!this.enabled) return;
    if (this.connectionRetries >= 30) {
      this.memoryStore.set("discordPresenceConnectionFailed", true);
      return;
    }

    this.connectionRetries++;
    log.info(`Connecting to Discord attempt ${this.connectionRetries}/30`);

    clearTimeout(this.connectionRetryTimeout);
    this.connectionRetryTimeout = setTimeout(() => {
      if (!this.discordClient) return;
      this.discordClient.connect().catch(() => this.retryDiscordConnection());
    }, 5 * 1000);
  }

  public enable(): void {
    this.enabled = true;
    if (this.discordClient) return;
    const clientId = resolveClientId(this.store.get("integrations.discordPresenceClientId") as string | undefined);
    this.discordClient = new DiscordClient(clientId);

    this.discordClient.on("connect", () => {
      this.ready = true;
      this.connectionRetries = 0;
      this.memoryStore.set("discordPresenceConnectionFailed", false);
    });
    this.discordClient.on("close", () => {
      log.info("Discord connection closed");
      this.ready = false;
      this.retryDiscordConnection();
    });
    this.discordClient.connect().catch(() => this.retryDiscordConnection());
    this.stateCallback = event => {
      this.playerStateChanged(event);
    };

    playerStateStore.addEventListener(this.stateCallback);
  }

  public disable(): void {
    this.enabled = false;
    this.connectionRetries = 0;
    this.memoryStore.set("discordPresenceConnectionFailed", false);

    clearTimeout(this.activityDebounceTimeout);
    clearTimeout(this.pauseTimeout);
    clearTimeout(this.connectionRetryTimeout);
    this.activityDebounceTimeout = this.pauseTimeout = this.connectionRetryTimeout = null;

    if (this.stateCallback) {
      playerStateStore.removeEventListener(this.stateCallback);
    }

    if (!this.discordClient) return;
    this.ready = false;
    this.discordClient.destroy();
    this.discordClient = null;
  }

  public getYTMScripts(): { name: string; script: string }[] {
    return [];
  }
}
