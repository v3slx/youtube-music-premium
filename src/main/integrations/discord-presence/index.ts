import playerStateStore, { PlayerState, Thumbnail, VideoDetails, VideoState } from "../../player-state-store";
import IIntegration from "../integration";
import MemoryStore from "../../memory-store";
import { MemoryStoreSchema, StoreSchema } from "~shared/store/schema";
import DiscordClient from "./minimal-discord-client";
import log from "electron-log";
import { DiscordActivityType } from "./minimal-discord-client/types";
import Conf from "conf";

const DEFAULT_DISCORD_CLIENT_ID = "1548008608577364078";

const FAST_RETRY_ATTEMPTS = 30;
const FAST_RETRY_DELAY_MS = 5 * 1000;
// Discord is often opened long after the app, so it keeps being looked for at a slower pace instead of giving up
const SLOW_RETRY_DELAY_MS = 30 * 1000;

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
  private hasFullMetadata = false;

  private connectionRetries: number = 0;
  private lastConnectionError: string | null = null;

  private UpdateActivity() {
    if (this.activityDebounceTimeout) return;
    this.activityDebounceTimeout = setTimeout(() => {
      this.activityDebounceTimeout = null;
      if (!this.ready || !this.discordClient) return;
      if (!this.videoDetails) {
        this.discordClient.clearActivity();
        return;
      }
      try {
        const { album, id, thumbnails, durationSeconds, channelId, albumId } = this.videoDetails;
        const title = this.videoDetails.title ?? "";
        const author = this.videoDetails.author ?? "";
        const thumbnail = thumbnails?.length ? getHighestResThumbnail(thumbnails) : undefined;
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
      } catch (error) {
        // One track with odd metadata must not stop the presence for the rest of the session
        log.warn("Discord presence: could not build the activity", error);
      }
    }, 1000);
  }

  private playerStateChanged(state: PlayerState) {
    const { videoDetails, videoProgress, trackState, hasFullMetadata } = state;
    if (!videoDetails) {
      this.videoState = null;
      this.videoDetails = null;
      this.progress = null;
      this.hasFullMetadata = false;
      if (this.ready) this.discordClient.clearActivity();
      return;
    }
    const oldState = this.videoState ?? null;
    const oldId = this.videoDetails?.id ?? null;
    const oldProgress = this.progress ?? null;
    this.videoState = trackState;
    this.videoDetails = videoDetails;
    this.progress = Math.floor(videoProgress);
    this.hasFullMetadata = hasFullMetadata;
    // Without Discord only the state is kept, the connect handler shows it once Discord is reachable
    if (!this.ready) return;

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
      if (!this.discordClient || !this.ready) return;
      this.discordClient.clearActivity();
      this.pauseTimeout = null;
    }, 30 * 1000);
  }

  public provide(store: Conf<StoreSchema>, memoryStore: MemoryStore<MemoryStoreSchema>): void {
    this.store = store;
    this.memoryStore = memoryStore;
  }

  private connectToDiscord() {
    const discordClient = this.discordClient;
    if (!discordClient) return;
    discordClient.connect().catch((error: unknown) => {
      // A client that was replaced in the meantime must not schedule attempts for its successor
      if (discordClient !== this.discordClient) return;
      const reason = error instanceof Error ? error.message : String(error);
      if (reason !== this.lastConnectionError) {
        this.lastConnectionError = reason;
        log.info(`Discord presence could not connect: ${reason}`);
      }
      this.retryDiscordConnection();
    });
  }

  private retryDiscordConnection() {
    if (!this.enabled) return;
    if (this.connectionRetries === FAST_RETRY_ATTEMPTS) {
      log.info(`Discord not reachable after ${FAST_RETRY_ATTEMPTS} attempts, trying every ${SLOW_RETRY_DELAY_MS / 1000} seconds from now on`);
      this.memoryStore.set("discordPresenceConnectionFailed", true);
    }
    const delay = this.connectionRetries < FAST_RETRY_ATTEMPTS ? FAST_RETRY_DELAY_MS : SLOW_RETRY_DELAY_MS;
    this.connectionRetries++;

    clearTimeout(this.connectionRetryTimeout);
    this.connectionRetryTimeout = setTimeout(() => this.connectToDiscord(), delay);
  }

  public enable(): void {
    this.enabled = true;
    if (this.discordClient) return;
    const clientId = resolveClientId(this.store.get("integrations.discordPresenceClientId") as string | undefined);
    const discordClient = new DiscordClient(clientId);
    this.discordClient = discordClient;

    discordClient.on("connect", () => {
      this.ready = true;
      this.connectionRetries = 0;
      this.lastConnectionError = null;
      this.memoryStore.set("discordPresenceConnectionFailed", false);
      this.memoryStore.set("discordPresenceUsername", discordClient.username);
      this.memoryStore.set("discordPresenceConnected", true);
      // A song that started while Discord wasn't reachable shows up right away instead of at the next track change
      if (this.videoDetails && this.hasFullMetadata && this.videoState === VideoState.Playing) {
        this.UpdateActivity();
      }
    });
    discordClient.on("close", () => {
      log.info("Discord connection closed");
      this.ready = false;
      this.memoryStore.set("discordPresenceConnected", false);
      this.retryDiscordConnection();
    });
    this.connectToDiscord();
    this.stateCallback = event => {
      this.playerStateChanged(event);
    };

    playerStateStore.addEventListener(this.stateCallback);
  }

  public disable(): void {
    this.enabled = false;
    this.connectionRetries = 0;
    this.lastConnectionError = null;
    this.memoryStore.set("discordPresenceConnectionFailed", false);
    this.memoryStore.set("discordPresenceConnected", false);

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
