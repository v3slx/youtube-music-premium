export enum TrayIconStyle {
  Auto = 0,
  White = 1,
  Black = 2
}

export enum ThemePreset {
  Default = 0,
  Midnight = 1,
  Ocean = 2,
  Forest = 3,
  // Colours taken from the album art of the song that is playing
  Dynamic = 4
}

// Colours of a theme, also sent to the app's own windows for the dynamic theme
export type ThemePalette = {
  background: string; // Page, sidebar and top bar
  surface: string; // Player bar, cards
  raised: string; // Menus, dialogs, search field
  highlight: string; // Hover states
  text: string;
  accent: string;
};

export const EQUALIZER_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

// Gains in dB for the ten bands above
export const EQUALIZER_PRESETS: Record<string, { name: string; bands: number[] }> = {
  flat: { name: "Flat", bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { name: "Bass boost", bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  treble: { name: "Treble boost", bands: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  vocal: { name: "Vocal", bands: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
  rock: { name: "Rock", bands: [4, 3, 2, 0, -1, -1, 1, 2, 3, 4] },
  pop: { name: "Pop", bands: [-1, 1, 2, 3, 2, 0, -1, -1, 1, 1] },
  electronic: { name: "Electronic", bands: [5, 4, 1, 0, -2, 1, 0, 1, 4, 5] },
  acoustic: { name: "Acoustic", bands: [3, 2, 1, 1, 2, 2, 3, 3, 2, 1] },
  late: { name: "Late night", bands: [-3, -2, -1, 0, 1, 2, 2, 1, -1, -2] }
};

export type StoreSchema = {
  metadata: {
    version: 1;
  };
  general: {
    disableHardwareAcceleration: boolean;
    hideToTrayOnClose: boolean;
    showNotificationOnSongChange: boolean;
    notificationControls: boolean;
    listeningStats: boolean;
    startOnBoot: boolean;
    startMinimized: boolean;
  };
  appearance: {
    alwaysShowVolumeSlider: boolean;
    customCSSEnabled: boolean;
    customCSSPath: string | null;
    theme: ThemePreset;
    zoom: number;
    trayIconStyle: TrayIconStyle;
    miniPlayerAlwaysOnTop: boolean;
  };
  playback: {
    continueWhereYouLeftOff: boolean;
    continueWhereYouLeftOffPaused: boolean;
    enableSpeakerFill: boolean;
    progressInTaskbar: boolean;
    ratioVolume: boolean;
    audioOutputDeviceId: string;
    timedLyrics: boolean;
    timedLyricsFontSize: number;
    timedLyricsOffsetMs: number;
    lyricsCommunitySources: boolean;
    lyricsWordAnimation: boolean;
    equalizerEnabled: boolean;
    equalizerPreset: string;
    equalizerBands: number[];
    volumeLeveling: boolean;
    pauseOnDeviceDisconnect: boolean;
    pauseOnLock: boolean;
  };
  integrations: {
    companionServerEnabled: boolean;
    companionServerAuthTokens: string | null; // array[object] | Encrypted for security
    companionServerCORSWildcardEnabled: boolean;
    discordPresenceEnabled: boolean;
    discordPresenceClientId: string;
    lastFMEnabled: boolean;
  };
  shortcuts: {
    playPause: string;
    next: string;
    previous: string;
    thumbsUp: string;
    thumbsDown: string;
    volumeUp: string;
    volumeDown: string;
    miniPlayer: string;
    lyricsFullscreen: string;
  };
  state: {
    lastUrl: string;
    lastPlaylistId: string;
    lastVideoId: string;
    windowBounds: Electron.Rectangle | null;
    windowMaximized: boolean;
    miniPlayerBounds: Electron.Rectangle | null;
    // The version whose "What's new" was shown, so it appears once after an update
    lastSeenVersion: string | null;
  };
  lastfm: {
    api_key: string;
    secret: string;
    token: string | null;
    sessionKey: string | null;
    scrobblePercent: number;
  };
  developer: {
    enableDevTools: boolean;
  };
};

export type MemoryStoreSchema = {
  discordPresenceConnectionFailed: boolean;
  discordPresenceConnected: boolean;
  discordPresenceUsername: string | null;
  shortcutsPlayPauseRegisterFailed: boolean;
  shortcutsNextRegisterFailed: boolean;
  shortcutsPreviousRegisterFailed: boolean;
  shortcutsThumbsUpRegisterFailed: boolean;
  shortcutsThumbsDownRegisterFailed: boolean;
  shortcutsVolumeUpRegisterFailed: boolean;
  shortcutsVolumeDownRegisterFailed: boolean;
  shortcutsMiniPlayerRegisterFailed: boolean;
  shortcutsLyricsFullscreenRegisterFailed: boolean;
  companionServerAuthWindowEnabled: boolean;
  safeStorageAvailable: boolean;
  autoUpdaterDisabled: boolean;
  ytmViewLoadTimedout: boolean;
  ytmViewLoading: boolean;
  ytmViewLoadingError: boolean;
  ytmViewLoadingStatus: string;
  ytmViewUnresponsive: boolean;
  appUpdateAvailable: boolean;
  appUpdateDownloaded: boolean;
  dynamicPalette: ThemePalette | null;
};
