<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import KeybindInput from "../../components/KeybindInput.vue";
import YTMDSetting from "../../components/YTMDSetting.vue";
import SettingsSection from "../../components/SettingsSection.vue";
import SettingsSearchText from "../../components/SettingsSearchText.vue";
import EqualizerEditor from "../../components/EqualizerEditor.vue";
import ListeningStats from "../../components/ListeningStats.vue";
import { provideSettingsSearch } from "../../composables/useSettingsSearch";
import { EQUALIZER_PRESETS, StoreSchema, ThemePreset, TrayIconStyle } from "~shared/store/schema";
import { AuthToken } from "~shared/integrations/companion-server/types";
import logo from "~assets/icons/ytmd.png";

declare const YTMD_GIT_COMMIT_HASH: string;
declare const YTMD_GIT_BRANCH: string;

const ytmdVersion = await window.ytmd.getAppVersion();
const ytmdCommitHash = YTMD_GIT_COMMIT_HASH.substring(0, 7);
const ytmdBranch = YTMD_GIT_BRANCH;

const isDarwin = window.ytmd.isDarwin;
const isLinux = window.ytmd.isLinux;

const currentTab = ref(1);
const searchInput = ref<HTMLInputElement | null>(null);
const content = ref<HTMLElement | null>(null);
const { query, searching, counts, resultCount } = provideSettingsSearch();
const sections = [
  { id: 1, title: "General", icon: "tune" },
  { id: 2, title: "Appearance", icon: "palette" },
  { id: 3, title: "Playback", icon: "play_circle" },
  { id: 4, title: "Integrations", icon: "extension" },
  { id: 5, title: "Shortcuts", icon: "keyboard" },
  { id: 7, title: "Listening stats", icon: "insights" },
  { id: 6, title: "Advanced", icon: "code" },
  { id: 99, title: "About", icon: "info" }
];
const visibleSections = computed(() => sections.filter(section => !searching.value || (counts.value.get(section.id) ?? 0) > 0));

function sectionVisible(section: number) {
  return searching.value ? (counts.value.get(section) ?? 0) > 0 : currentTab.value === section;
}

function clearSearch() {
  query.value = "";
  searchInput.value?.focus();
}

watch(query, () => content.value?.scrollTo({ top: 0 }));
const requiresRestart = ref(false);
const checkingForUpdate = ref(false);
const updateAvailable = ref(await window.ytmd.isAppUpdateAvailable());
const updateNotAvailable = ref(false);
const updateDownloaded = ref(await window.ytmd.isAppUpdateDownloaded());

const store = window.ytmd.store;
const memoryStore = window.ytmd.memoryStore;
const safeStorage = window.ytmd.safeStorage;

const safeStorageAvailable = ref<boolean>(await memoryStore.get("safeStorageAvailable"));

const general: StoreSchema["general"] = await store.get("general");
const appearance: StoreSchema["appearance"] = await store.get("appearance");
const playback: StoreSchema["playback"] = await store.get("playback");
const integrations: StoreSchema["integrations"] = await store.get("integrations");
const shortcuts: StoreSchema["shortcuts"] = await store.get("shortcuts");
const lastFM: StoreSchema["lastfm"] = await store.get("lastfm");

const disableHardwareAcceleration = ref<boolean>(general.disableHardwareAcceleration);
const hideToTrayOnClose = ref<boolean>(general.hideToTrayOnClose);
const showNotificationOnSongChange = ref<boolean>(general.showNotificationOnSongChange);
const notificationControls = ref<boolean>(general.notificationControls);
const listeningStatsEnabled = ref<boolean>(general.listeningStats);
const transferMessage = ref<{ text: string; error: boolean } | null>(null);

const showWhatsNew = () => window.ytmd.showWhatsNew();

async function exportSettings() {
  const result = await window.ytmd.exportSettings();
  if (result.ok) transferMessage.value = { text: `Settings exported to ${result.path}`, error: false };
  else if (!result.canceled) transferMessage.value = { text: result.error ?? "The settings could not be exported.", error: true };
}

async function importSettings() {
  const result = await window.ytmd.importSettings();
  if (result.ok) transferMessage.value = { text: `${result.count} settings imported.`, error: false };
  else if (!result.canceled) transferMessage.value = { text: result.error ?? "The settings could not be imported.", error: true };
}
const startOnBoot = ref<boolean>(general.startOnBoot);
const startMinimized = ref<boolean>(general.startMinimized);

const alwaysShowVolumeSlider = ref<boolean>(appearance.alwaysShowVolumeSlider);
const customCSSEnabled = ref<boolean>(appearance.customCSSEnabled);
const customCSSPath = ref<string>(appearance.customCSSPath);
const theme = ref<ThemePreset>(appearance.theme);
const zoom = ref<number>(appearance.zoom);
const trayIconStyle = ref<number>(appearance.trayIconStyle);
const miniPlayerAlwaysOnTop = ref<boolean>(appearance.miniPlayerAlwaysOnTop);

const continueWhereYouLeftOff = ref<boolean>(playback.continueWhereYouLeftOff);
const continueWhereYouLeftOffPaused = ref<boolean>(playback.continueWhereYouLeftOffPaused);
const enableSpeakerFill = ref<boolean>(playback.enableSpeakerFill);
const progressInTaskbar = ref<boolean>(playback.progressInTaskbar);
const ratioVolume = ref<boolean>(playback.ratioVolume);
const timedLyrics = ref<boolean>(playback.timedLyrics);
const timedLyricsFontSize = ref<number>(playback.timedLyricsFontSize);
const timedLyricsOffsetMs = ref<number>(playback.timedLyricsOffsetMs);
const audioOutputDeviceId = ref<string>(playback.audioOutputDeviceId);
const equalizerEnabled = ref<boolean>(playback.equalizerEnabled);
const equalizerPreset = ref<string>(playback.equalizerPreset);
const equalizerBands = ref<number[]>([...playback.equalizerBands]);
const volumeLeveling = ref<boolean>(playback.volumeLeveling);
const pauseOnDeviceDisconnect = ref<boolean>(playback.pauseOnDeviceDisconnect);
const pauseOnLock = ref<boolean>(playback.pauseOnLock);
const equalizerPresetOptions = {
  ...Object.fromEntries(Object.entries(EQUALIZER_PRESETS).map(([id, preset]) => [id, preset.name])),
  custom: "Custom"
};

/** Picking a preset moves the sliders; moving a slider yourself makes it "Custom" (or the preset it matches). */
function equalizerPresetChanged() {
  const preset = EQUALIZER_PRESETS[equalizerPreset.value];
  if (preset) equalizerBands.value = [...preset.bands];
  settingsChanged();
}

function equalizerBandsChanged() {
  const matching = Object.entries(EQUALIZER_PRESETS).find(([, preset]) => preset.bands.every((gain, index) => gain === equalizerBands.value[index]));
  equalizerPreset.value = matching ? matching[0] : "custom";
  settingsChanged();
}
const audioOutputDevices = ref<{ deviceId: string; label: string }[]>([]);
const audioOutputOptions = computed<Record<string, string>>(() => {
  const options: Record<string, string> = {
    default: "System default",
    ...Object.fromEntries(
      audioOutputDevices.value
        .filter(device => device.deviceId && device.deviceId !== "default")
        .map((device, index) => [device.deviceId, device.label || `Audio output ${index + 1}`])
    )
  };
  // Keep the saved device selectable/visible while the list loads or when the device is unplugged
  if (!(audioOutputDeviceId.value in options)) options[audioOutputDeviceId.value] = "Saved device (not connected)";
  return options;
});

const companionServerEnabled = ref<boolean>(integrations.companionServerEnabled);
const companionServerAuthTokens = ref<AuthToken[]>(
  safeStorageAvailable.value ? (JSON.parse(await safeStorage.decryptString(integrations.companionServerAuthTokens)) ?? []) : []
);
const companionServerCORSWildcardEnabled = ref<boolean>(integrations.companionServerCORSWildcardEnabled);
const discordPresenceEnabled = ref<boolean>(integrations.discordPresenceEnabled);
const discordPresenceClientId = ref<string>(integrations.discordPresenceClientId);
const lastFMEnabled = ref<boolean>(integrations.lastFMEnabled);

const shortcutPlayPause = ref<string>(shortcuts.playPause);
const shortcutNext = ref<string>(shortcuts.next);
const shortcutPrevious = ref<string>(shortcuts.previous);
const shortcutThumbsUp = ref<string>(shortcuts.thumbsUp);
const shortcutThumbsDown = ref<string>(shortcuts.thumbsDown);
const shortcutVolumeUp = ref<string>(shortcuts.volumeUp);
const shortcutVolumeDown = ref<string>(shortcuts.volumeDown);
const shortcutMiniPlayer = ref<string>(shortcuts.miniPlayer);
const shortcutLyricsFullscreen = ref<string>(shortcuts.lyricsFullscreen);

const lastFMSessionKey = ref<string>(lastFM.sessionKey);
const scrobblePercent = ref<number>(lastFM.scrobblePercent);

store.onDidAnyChange(async newState => {
  disableHardwareAcceleration.value = newState.general.disableHardwareAcceleration;
  hideToTrayOnClose.value = newState.general.hideToTrayOnClose;
  showNotificationOnSongChange.value = newState.general.showNotificationOnSongChange;
  notificationControls.value = newState.general.notificationControls;
  listeningStatsEnabled.value = newState.general.listeningStats;
  startOnBoot.value = newState.general.startOnBoot;
  startMinimized.value = newState.general.startMinimized;

  alwaysShowVolumeSlider.value = newState.appearance.alwaysShowVolumeSlider;
  customCSSEnabled.value = newState.appearance.customCSSEnabled;
  customCSSPath.value = newState.appearance.customCSSPath;
  theme.value = newState.appearance.theme;
  zoom.value = newState.appearance.zoom;
  trayIconStyle.value = newState.appearance.trayIconStyle;
  miniPlayerAlwaysOnTop.value = newState.appearance.miniPlayerAlwaysOnTop;

  continueWhereYouLeftOff.value = newState.playback.continueWhereYouLeftOff;
  continueWhereYouLeftOffPaused.value = newState.playback.continueWhereYouLeftOffPaused;
  enableSpeakerFill.value = newState.playback.enableSpeakerFill;
  progressInTaskbar.value = newState.playback.progressInTaskbar;
  ratioVolume.value = newState.playback.ratioVolume;
  timedLyrics.value = newState.playback.timedLyrics;
  timedLyricsFontSize.value = newState.playback.timedLyricsFontSize;
  timedLyricsOffsetMs.value = newState.playback.timedLyricsOffsetMs;
  audioOutputDeviceId.value = newState.playback.audioOutputDeviceId;
  equalizerEnabled.value = newState.playback.equalizerEnabled;
  equalizerPreset.value = newState.playback.equalizerPreset;
  equalizerBands.value = [...newState.playback.equalizerBands];
  volumeLeveling.value = newState.playback.volumeLeveling;
  pauseOnDeviceDisconnect.value = newState.playback.pauseOnDeviceDisconnect;
  pauseOnLock.value = newState.playback.pauseOnLock;

  companionServerEnabled.value = newState.integrations.companionServerEnabled;
  companionServerAuthTokens.value = safeStorageAvailable.value
    ? (JSON.parse(await safeStorage.decryptString(newState.integrations.companionServerAuthTokens)) ?? [])
    : [];
  companionServerCORSWildcardEnabled.value = newState.integrations.companionServerCORSWildcardEnabled;
  discordPresenceEnabled.value = newState.integrations.discordPresenceEnabled;
  discordPresenceClientId.value = newState.integrations.discordPresenceClientId;
  lastFMEnabled.value = newState.integrations.lastFMEnabled;
  lastFMSessionKey.value = newState.lastfm.sessionKey;
  scrobblePercent.value = newState.lastfm.scrobblePercent;

  shortcutPlayPause.value = newState.shortcuts.playPause;
  shortcutNext.value = newState.shortcuts.next;
  shortcutPrevious.value = newState.shortcuts.previous;
  shortcutThumbsUp.value = newState.shortcuts.thumbsUp;
  shortcutThumbsDown.value = newState.shortcuts.thumbsDown;
  shortcutVolumeUp.value = newState.shortcuts.volumeUp;
  shortcutVolumeDown.value = newState.shortcuts.volumeDown;
  shortcutMiniPlayer.value = newState.shortcuts.miniPlayer;
  shortcutLyricsFullscreen.value = newState.shortcuts.lyricsFullscreen;
});

const discordPresenceConnectionFailed = ref<boolean>(await memoryStore.get("discordPresenceConnectionFailed"));
const discordPresenceConnected = ref<boolean>(await memoryStore.get("discordPresenceConnected"));
const discordPresenceUsername = ref<string | null>(await memoryStore.get("discordPresenceUsername"));

const shortcutsPlayPauseRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsPlayPauseRegisterFailed"));
const shortcutsNextRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsNextRegisterFailed"));
const shortcutsPreviousRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsPreviousRegisterFailed"));
const shortcutsThumbsUpRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsThumbsUpRegisterFailed"));
const shortcutsThumbsDownRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsThumbsDownRegisterFailed"));
const shortcutsVolumeUpRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsVolumeUpRegisterFailed"));
const shortcutsVolumeDownRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsVolumeDownRegisterFailed"));
const shortcutsMiniPlayerRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsMiniPlayerRegisterFailed"));
const shortcutsLyricsFullscreenRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsLyricsFullscreenRegisterFailed"));

const companionServerAuthWindowEnabled = ref<boolean>(await memoryStore.get("companionServerAuthWindowEnabled"));

const autoUpdaterDisabled = ref<boolean>(await memoryStore.get("autoUpdaterDisabled"));

memoryStore.onStateChanged(newState => {
  discordPresenceConnectionFailed.value = newState.discordPresenceConnectionFailed;
  discordPresenceConnected.value = newState.discordPresenceConnected;
  discordPresenceUsername.value = newState.discordPresenceUsername;

  shortcutsPlayPauseRegisterFailed.value = newState.shortcutsPlayPauseRegisterFailed;
  shortcutsNextRegisterFailed.value = newState.shortcutsNextRegisterFailed;
  shortcutsPreviousRegisterFailed.value = newState.shortcutsPreviousRegisterFailed;
  shortcutsThumbsUpRegisterFailed.value = newState.shortcutsThumbsUpRegisterFailed;
  shortcutsThumbsDownRegisterFailed.value = newState.shortcutsThumbsDownRegisterFailed;
  shortcutsVolumeUpRegisterFailed.value = newState.shortcutsVolumeUpRegisterFailed;
  shortcutsVolumeDownRegisterFailed.value = newState.shortcutsVolumeDownRegisterFailed;
  shortcutsMiniPlayerRegisterFailed.value = newState.shortcutsMiniPlayerRegisterFailed;
  shortcutsLyricsFullscreenRegisterFailed.value = newState.shortcutsLyricsFullscreenRegisterFailed;

  companionServerAuthWindowEnabled.value = newState.companionServerAuthWindowEnabled;

  safeStorageAvailable.value = newState.safeStorageAvailable;

  autoUpdaterDisabled.value = newState.autoUpdaterDisabled;
});

async function memorySettingsChanged() {
  memoryStore.set("companionServerAuthWindowEnabled", companionServerAuthWindowEnabled.value);
}

async function settingsChanged() {
  store.set("general.hideToTrayOnClose", hideToTrayOnClose.value);
  store.set("general.showNotificationOnSongChange", showNotificationOnSongChange.value);
  store.set("general.notificationControls", notificationControls.value);
  store.set("general.listeningStats", listeningStatsEnabled.value);
  store.set("general.startOnBoot", startOnBoot.value);
  store.set("general.startMinimized", startMinimized.value);
  store.set("general.disableHardwareAcceleration", disableHardwareAcceleration.value);

  store.set("appearance.alwaysShowVolumeSlider", alwaysShowVolumeSlider.value);
  store.set("appearance.customCSSEnabled", customCSSEnabled.value);
  store.set("appearance.theme", theme.value);
  store.set("appearance.zoom", zoom.value);
  store.set("appearance.trayIconStyle", trayIconStyle.value);
  store.set("appearance.miniPlayerAlwaysOnTop", miniPlayerAlwaysOnTop.value);

  store.set("playback.continueWhereYouLeftOff", continueWhereYouLeftOff.value);
  store.set("playback.continueWhereYouLeftOffPaused", continueWhereYouLeftOffPaused.value);
  store.set("playback.progressInTaskbar", progressInTaskbar.value);
  store.set("playback.enableSpeakerFill", enableSpeakerFill.value);
  store.set("playback.ratioVolume", ratioVolume.value);
  store.set("playback.timedLyrics", timedLyrics.value);
  store.set("playback.timedLyricsFontSize", timedLyricsFontSize.value);
  store.set("playback.timedLyricsOffsetMs", timedLyricsOffsetMs.value);
  store.set("playback.audioOutputDeviceId", audioOutputDeviceId.value);
  store.set("playback.equalizerEnabled", equalizerEnabled.value);
  store.set("playback.equalizerPreset", equalizerPreset.value);
  // A plain copy: the reactive array itself can't be sent to the main process
  store.set("playback.equalizerBands", [...equalizerBands.value]);
  store.set("playback.volumeLeveling", volumeLeveling.value);
  store.set("playback.pauseOnDeviceDisconnect", pauseOnDeviceDisconnect.value);
  store.set("playback.pauseOnLock", pauseOnLock.value);

  store.set("integrations.companionServerEnabled", companionServerEnabled.value);
  store.set("integrations.companionServerCORSWildcardEnabled", companionServerCORSWildcardEnabled.value);
  store.set("integrations.discordPresenceEnabled", discordPresenceEnabled.value);
  store.set("integrations.discordPresenceClientId", discordPresenceClientId.value.trim());
  store.set("integrations.lastFMEnabled", lastFMEnabled.value);
  store.set("lastfm.scrobblePercent", scrobblePercent.value);

  store.set("shortcuts.playPause", shortcutPlayPause.value);
  store.set("shortcuts.next", shortcutNext.value);
  store.set("shortcuts.previous", shortcutPrevious.value);
  store.set("shortcuts.thumbsUp", shortcutThumbsUp.value);
  store.set("shortcuts.thumbsDown", shortcutThumbsDown.value);
  store.set("shortcuts.volumeUp", shortcutVolumeUp.value);
  store.set("shortcuts.volumeDown", shortcutVolumeDown.value);
  store.set("shortcuts.miniPlayer", shortcutMiniPlayer.value);
  store.set("shortcuts.lyricsFullscreen", shortcutLyricsFullscreen.value);
}

async function settingChangedRequiresRestart() {
  requiresRestart.value = true;
  settingsChanged();
}

async function settingChangedFile(event: Event) {
  const target = event.target as HTMLInputElement;

  const setting = target.dataset.setting;
  if (!setting) {
    throw new Error("No setting specified in File Input");
  }

  store.set(setting, target.files.length > 0 ? window.ytmd.getTrueFilePath(target.files[0]) : null);

  target.value = null;
}

async function restartDiscordPresence() {
  discordPresenceEnabled.value = false;
  await settingsChanged();
  discordPresenceEnabled.value = true;
  await settingsChanged();
}

async function refreshAudioOutputDevices() {
  try {
    audioOutputDevices.value = await window.ytmd.getAudioOutputDevices();
  } catch {
    audioOutputDevices.value = [];
  }
}

// Not awaited: the device list comes from the YTM view, which blocks until YTM has finished loading
void refreshAudioOutputDevices();

async function deleteCompanionAuthToken(appId: string) {
  const index = companionServerAuthTokens.value.findIndex(token => token.appId === appId);
  if (index > -1) {
    companionServerAuthTokens.value.splice(index, 1);
  }

  if (safeStorageAvailable.value)
    store.set("integrations.companionServerAuthTokens", await safeStorage.encryptString(JSON.stringify(companionServerAuthTokens.value)));
}

function removeCustomCSSPath() {
  store.set("appearance.customCSSPath", null);
}

async function changeTab(newTab: number) {
  currentTab.value = newTab;
  if (searching.value) {
    await nextTick();
    document.getElementById(`settings-section-${newTab}`)?.scrollIntoView({ block: "start" });
  } else {
    content.value?.scrollTo({ top: 0 });
  }
}

function restartApplication() {
  window.ytmd.restartApplication();
}

function restartApplicationForUpdate() {
  window.ytmd.restartApplicationForUpdate();
}

function checkForUpdates() {
  window.ytmd.checkForUpdates();
  checkingForUpdate.value = true;
}

async function logoutLastFM() {
  store.set("lastfm.sessionKey", null);
  lastFMEnabled.value = false;
  lastFMSessionKey.value = null;
  await settingsChanged();
}

window.ytmd.handleCheckingForUpdate(() => {
  checkingForUpdate.value = true;
});

window.ytmd.handleUpdateAvailable(() => {
  checkingForUpdate.value = false;
  updateAvailable.value = true;
  updateNotAvailable.value = false;
});

window.ytmd.handleUpdateNotAvailable(() => {
  checkingForUpdate.value = false;
  updateNotAvailable.value = true;
  updateAvailable.value = false;
});

window.ytmd.handleUpdateDownloaded(() => {
  checkingForUpdate.value = false;
  updateNotAvailable.value = false;
  updateAvailable.value = false;
  updateDownloaded.value = true;
});
</script>

<template>
  <div class="settings-container" @keydown.ctrl.f.prevent="searchInput?.focus()" @keydown.meta.f.prevent="searchInput?.focus()">
    <header class="settings-toolbar">
      <h1>Settings</h1>
      <div class="search-field">
        <span class="material-symbols-outlined" aria-hidden="true">search</span>
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="Search settings"
          aria-label="Search settings by title or description"
          autocomplete="off"
          spellcheck="false"
          @keydown.esc.prevent="clearSearch"
        />
        <button v-if="query" type="button" class="clear-search" aria-label="Clear search" title="Clear search" @click="clearSearch">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </header>
    <div class="content-container">
      <nav class="sidebar" aria-label="Settings sections">
        <button
          v-for="section in visibleSections"
          :key="section.id"
          type="button"
          :class="{ 'active': !searching && currentTab === section.id, 'about-link': section.id === 99 }"
          :aria-current="!searching && currentTab === section.id ? 'page' : undefined"
          :aria-controls="`settings-section-${section.id}`"
          @click="changeTab(section.id)"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{ section.icon }}</span>
          <span>{{ section.title }}</span>
          <span v-if="searching" class="match-count">{{ counts.get(section.id) }}</span>
        </button>
        <p v-if="!visibleSections.length" class="sidebar-empty">No matching sections</p>
      </nav>
      <main ref="content" class="content" :class="{ searching }" aria-label="Settings">
        <p v-if="searching" class="search-summary" role="status">{{ resultCount }} {{ resultCount === 1 ? "result" : "results" }} across all settings</p>
        <div v-if="searching && !resultCount" class="empty-search">
          <span class="material-symbols-outlined" aria-hidden="true">search_off</span>
          <h2>No settings found</h2>
          <p>Try a different word, such as theme, lyrics or Discord.</p>
          <button type="button" @click="clearSearch">Clear search</button>
        </div>
        <div v-if="requiresRestart" class="restart-banner">
          <p class="message"><span class="material-symbols-outlined">autorenew</span> Restart app to apply changes</p>
          <button class="restart-button" @click="restartApplication">Restart</button>
        </div>
        <SettingsSection
          v-show="sectionVisible(1)"
          :section="1"
          title="General"
          description="Choose how the app starts and keeps you informed."
          class="general-tab"
        >
          <YTMDSetting v-if="!isDarwin" v-model="hideToTrayOnClose" type="checkbox" name="Hide to tray on close" @change="settingsChanged" />
          <YTMDSetting
            v-model="showNotificationOnSongChange"
            type="checkbox"
            name="Show notification on song change"
            description="With the album art. Not shown while the app window is in front."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="showNotificationOnSongChange || searching"
            v-model="notificationControls"
            :disabled="!showNotificationOnSongChange"
            disabled-message="Enable Show notification on song change in General to change this setting."
            type="checkbox"
            indented
            name="Playback buttons in the notification"
            description="Previous, pause and next right in the notification."
            @change="settingsChanged"
          />
          <YTMDSetting v-model="startOnBoot" type="checkbox" name="Start on boot" @change="settingsChanged" />
          <!--<div class="setting">
            <p>Start minimized</p>
            <input v-model="startMinimized" @change="settingsChanged" class="toggle" type="checkbox" />
          </div>-->
        </SettingsSection>

        <SettingsSection v-show="sectionVisible(2)" :section="2" title="Appearance" description="Make your listening space feel right." class="appearance-tab">
          <YTMDSetting v-model="alwaysShowVolumeSlider" type="checkbox" name="Always show volume slider" @change="settingsChanged" />

          <YTMDSetting
            v-model="theme"
            :options-map="{
              [ThemePreset.Default]: 'Standard (YouTube Music)',
              [ThemePreset.Midnight]: 'Midnight',
              [ThemePreset.Ocean]: 'Ocean',
              [ThemePreset.Forest]: 'Forest',
              [ThemePreset.Dynamic]: 'Dynamic (from the album art)'
            }"
            type="select"
            name="Theme"
            description="Standard, Midnight, Ocean, Forest or Dynamic, which takes its colours from the album art of the song that is playing. Applies to the player and all windows. Custom CSS is available in Advanced."
            @change="settingsChanged"
          />
          <YTMDSetting v-model="zoom" type="range" max="300" min="30" step="10" name="Zoom" @change="settingsChanged" />
          <YTMDSetting
            v-model="miniPlayerAlwaysOnTop"
            type="checkbox"
            name="Keep the mini player on top"
            description="The mini player opens from the title bar, the tray or its shortcut and stays above other windows."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="isLinux"
            v-model="trayIconStyle"
            :options-map="{ [TrayIconStyle.Auto]: 'Auto', [TrayIconStyle.White]: 'White', [TrayIconStyle.Black]: 'Black' }"
            type="select"
            name="Tray icon style"
            @change="settingsChanged"
          />
        </SettingsSection>

        <SettingsSection
          v-show="sectionVisible(3)"
          :section="3"
          title="Playback"
          description="Adjust audio, lyrics and playback behavior."
          class="playback-tab"
        >
          <YTMDSetting
            v-model="continueWhereYouLeftOff"
            name="Continue where you left off"
            description="Resume your last session, with the option to pause on application launch."
            type="checkbox"
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="continueWhereYouLeftOff || searching"
            v-model="continueWhereYouLeftOffPaused"
            :disabled="!continueWhereYouLeftOff"
            disabled-message="Enable Continue where you left off in Playback to change this setting."
            type="checkbox"
            indented
            name="Pause on application launch"
            @change="settingsChanged"
          />
          <YTMDSetting v-model="progressInTaskbar" type="checkbox" name="Show track progress on taskbar" @change="settingsChanged" />
          <YTMDSetting v-model="enableSpeakerFill" type="checkbox" restart-required name="Enable speaker fill" @change="settingChangedRequiresRestart" />
          <YTMDSetting v-model="ratioVolume" type="checkbox" name="Ratio volume" @change="settingsChanged" />
          <YTMDSetting
            v-model="timedLyrics"
            type="checkbox"
            name="Synced lyrics"
            description="Follow along with supported songs. Adjust the lyrics font size and timing offset below."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="timedLyrics || searching"
            v-model="timedLyricsFontSize"
            :disabled="!timedLyrics"
            disabled-message="Enable Synced lyrics in Playback to adjust this setting."
            type="range"
            indented
            max="40"
            min="14"
            step="2"
            name="Lyrics font size"
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="timedLyrics || searching"
            v-model="timedLyricsOffsetMs"
            :disabled="!timedLyrics"
            disabled-message="Enable Synced lyrics in Playback to adjust this setting."
            type="range"
            indented
            max="3000"
            min="-3000"
            step="100"
            name="Lyrics offset in milliseconds"
            description="Positive values highlight each line earlier, for when the lyrics run behind the song."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="audioOutputDeviceId"
            :options-map="audioOutputOptions"
            type="select"
            name="Audio output device"
            description="Routes YouTube Music audio to the selected device."
            @change="settingsChanged"
          >
            <div class="audio-output-actions"><button @click="refreshAudioOutputDevices">Refresh devices</button></div>
          </YTMDSetting>
          <YTMDSetting
            v-model="pauseOnDeviceDisconnect"
            type="checkbox"
            name="Pause when headphones are disconnected"
            description="Pauses instead of carrying on through the speakers when the device that is playing goes away."
            @change="settingsChanged"
          />
          <YTMDSetting v-model="pauseOnLock" type="checkbox" name="Pause when the PC is locked" @change="settingsChanged" />
          <YTMDSetting
            v-model="equalizerEnabled"
            type="checkbox"
            name="Equalizer"
            description="Ten bands with presets such as bass boost, vocal and late night."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="equalizerEnabled || searching"
            v-model="equalizerPreset"
            :disabled="!equalizerEnabled"
            disabled-message="Enable Equalizer in Playback to change this setting."
            :options-map="equalizerPresetOptions"
            type="select"
            indented
            name="Equalizer preset"
            @change="equalizerPresetChanged"
          />
          <YTMDSetting
            v-if="equalizerEnabled"
            type="custom"
            flex-column
            indented
            name="Equalizer bands"
            description="Move a band to shape the sound yourself, hover it to see the value."
          >
            <EqualizerEditor v-model="equalizerBands" @change="equalizerBandsChanged" />
          </YTMDSetting>
          <YTMDSetting
            v-model="volumeLeveling"
            type="checkbox"
            name="Volume leveling"
            description="Evens out quiet and loud passages and songs, handy for playlists that mix old and new recordings."
            @change="settingsChanged"
          />
        </SettingsSection>

        <SettingsSection
          v-show="sectionVisible(4)"
          :section="4"
          title="Integrations"
          description="Connect your music to the apps you use."
          class="integrations-tab"
        >
          <YTMDSetting
            v-model="companionServerEnabled"
            type="checkbox"
            name="Companion server"
            description="Manage authorized companions, authorization requests and browser communication."
            :disabled="!safeStorageAvailable"
            disabled-message="This integration cannot be enabled due to safeStorage being unavailable"
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="(companionServerEnabled && safeStorageAvailable) || searching"
            v-model="companionServerCORSWildcardEnabled"
            :disabled="!companionServerEnabled || !safeStorageAvailable"
            disabled-message="Enable Companion server in Integrations to change this setting."
            type="checkbox"
            indented
            name="Allow browser communication"
            description="This setting could be dangerous as it allows any website you visit to communicate with the companion server"
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="(companionServerEnabled && safeStorageAvailable) || searching"
            v-model="companionServerAuthWindowEnabled"
            :disabled="!companionServerEnabled || !safeStorageAvailable"
            disabled-message="Enable Companion server in Integrations to change this setting."
            type="checkbox"
            indented
            name="Enable companion authorization"
            description="Automatically disables after the first successful authorization or 5 minutes has passed"
            @change="memorySettingsChanged"
          />
          <YTMDSetting
            v-if="companionServerEnabled && safeStorageAvailable"
            type="custom"
            flex-column
            indented
            name="Authorized companions"
            description="This is a list of companions that currently have access to the companion server"
            @change="settingsChanged"
          >
            <table class="authorized-companions-table">
              <thead>
                <tr>
                  <th class="companion">Companion</th>
                  <th class="version">Version</th>
                  <th class="controls"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="authToken in companionServerAuthTokens" :key="authToken.appId">
                  <td class="companion">
                    <span class="name">{{ authToken.appName }}</span
                    ><br />
                    <span class="id">{{ authToken.appId }}</span>
                  </td>
                  <td class="version">{{ authToken.appVersion }}</td>
                  <td class="controls">
                    <button :aria-label="`Remove ${authToken.appName} authorization`" @click="deleteCompanionAuthToken(authToken.appId)">
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="companionServerAuthTokens.length === 0" class="no-authorized-companions">
              <p>No authorized companions</p>
            </div>
          </YTMDSetting>
          <YTMDSetting
            v-model="discordPresenceEnabled"
            type="checkbox"
            name="Discord rich presence"
            description="Share your listening activity and customize the Discord application ID."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="discordPresenceEnabled || searching"
            :disabled="!discordPresenceEnabled"
            disabled-message="Enable Discord rich presence in Integrations to change the application ID."
            type="custom"
            flex-column
            indented
            name="Discord application ID"
            description="Discord always shows the name of the Discord application ('Listening to <name>'). To show 'YouTube Music Premium', create an application with exactly that name in the Discord Developer Portal and paste its Application ID here. Leave empty to use the default."
          >
            <input
              v-model="discordPresenceClientId"
              :disabled="!discordPresenceEnabled"
              class="discord-client-id"
              aria-label="Discord application ID"
              inputmode="numeric"
              placeholder="Default (YouTube Music)"
              @change="settingsChanged"
            />
            <a class="discord-portal-link" href="https://discord.com/developers/applications" target="_blank">Open Discord Developer Portal</a>
          </YTMDSetting>
          <YTMDSetting v-if="discordPresenceEnabled" type="custom" name="Discord connection" flex-column indented>
            <div v-if="discordPresenceConnected" class="setting indented">
              <div class="name-with-description">
                <p class="discord-connected">
                  Connected to Discord<template v-if="discordPresenceUsername"> as {{ discordPresenceUsername }}</template>
                </p>
                <p class="discord-failure">
                  The status appears while a song is playing. Nothing on your profile? In Discord, turn on Settings → Activity Privacy → Share my activity, and
                  make sure your status isn't set to Invisible.
                </p>
              </div>
            </div>
            <div v-else-if="discordPresenceConnectionFailed" class="setting indented">
              <p class="discord-failure">
                Discord was not found. The Discord desktop app has to be running, the browser version can't show a status. Still looking in the background.
              </p>
              <button @click="restartDiscordPresence">Retry</button>
            </div>
            <div v-else class="setting indented">
              <p class="discord-failure">Looking for Discord…</p>
            </div>
          </YTMDSetting>
          <YTMDSetting
            v-model="lastFMEnabled"
            type="checkbox"
            name="Last.fm scrobbling"
            description="Connect your Last.fm account and choose the scrobble percent."
            :disabled="!safeStorageAvailable"
            disabled-message="This integration cannot be enabled due to safeStorage being unavailable"
            @change="settingsChanged"
          />
          <YTMDSetting v-if="lastFMEnabled" type="custom" name="Last.fm account" indented>
            <div class="name-with-description">
              <p class="description">
                User is Authenticated:
                <span v-if="lastFMSessionKey" class="status-success">Yes</span>
                <span v-else class="status-error">No</span>
              </p>
            </div>
            <button v-if="lastFMSessionKey" @click="logoutLastFM">Logout</button>
          </YTMDSetting>
          <YTMDSetting
            v-if="lastFMEnabled || searching"
            v-model="scrobblePercent"
            :disabled="!lastFMEnabled"
            disabled-message="Enable Last.fm scrobbling in Integrations to change this setting."
            class="settings indented"
            type="range"
            name="Scrobble percent"
            description="Determines when a song is scrobbled"
            min="50"
            max="95"
            step="5"
            @change="settingsChanged"
          />
        </SettingsSection>

        <SettingsSection
          v-show="sectionVisible(5)"
          :section="5"
          title="Shortcuts"
          description="Select a shortcut and press your keys. Press Escape to clear it."
          class="shortcuts-tab"
        >
          <YTMDSetting type="custom" name="Play/Pause">
            <template #name>
              <span class="shortcut-title"
                ><SettingsSearchText text="Play/Pause" :query="query" /><span
                  v-if="shortcutsPlayPauseRegisterFailed"
                  class="material-symbols-outlined register-error"
                  title="Failed to register keybind. Does another application have this keybind?"
                  >error</span
                >
              </span>
            </template>
            <KeybindInput v-model="shortcutPlayPause" @change="settingsChanged" />
          </YTMDSetting>
          <YTMDSetting type="custom" name="Next">
            <template #name>
              <span class="shortcut-title"
                ><SettingsSearchText text="Next" :query="query" /><span
                  v-if="shortcutsNextRegisterFailed"
                  class="material-symbols-outlined register-error"
                  title="Failed to register keybind. Does another application have this keybind?"
                  >error</span
                >
              </span>
            </template>
            <KeybindInput v-model="shortcutNext" @change="settingsChanged" />
          </YTMDSetting>
          <YTMDSetting type="custom" name="Previous">
            <template #name>
              <span class="shortcut-title"
                ><SettingsSearchText text="Previous" :query="query" /><span
                  v-if="shortcutsPreviousRegisterFailed"
                  class="material-symbols-outlined register-error"
                  title="Failed to register keybind. Does another application have this keybind?"
                  >error</span
                >
              </span>
            </template>
            <KeybindInput v-model="shortcutPrevious" @change="settingsChanged" />
          </YTMDSetting>
          <YTMDSetting type="custom" name="Thumbs Up">
            <template #name>
              <span class="shortcut-title"
                ><SettingsSearchText text="Thumbs Up" :query="query" /><span
                  v-if="shortcutsThumbsUpRegisterFailed"
                  class="material-symbols-outlined register-error"
                  title="Failed to register keybind. Does another application have this keybind?"
                  >error</span
                >
              </span>
            </template>
            <KeybindInput v-model="shortcutThumbsUp" @change="settingsChanged" />
          </YTMDSetting>
          <YTMDSetting type="custom" name="Thumbs Down">
            <template #name>
              <span class="shortcut-title"
                ><SettingsSearchText text="Thumbs Down" :query="query" /><span
                  v-if="shortcutsThumbsDownRegisterFailed"
                  class="material-symbols-outlined register-error"
                  title="Failed to register keybind. Does another application have this keybind?"
                  >error</span
                >
              </span>
            </template>
            <KeybindInput v-model="shortcutThumbsDown" @change="settingsChanged" />
          </YTMDSetting>
          <YTMDSetting type="custom" name="Increase Volume">
            <template #name>
              <span class="shortcut-title"
                ><SettingsSearchText text="Increase Volume" :query="query" /><span
                  v-if="shortcutsVolumeUpRegisterFailed"
                  class="material-symbols-outlined register-error"
                  title="Failed to register keybind. Does another application have this keybind?"
                  >error</span
                >
              </span>
            </template>
            <KeybindInput v-model="shortcutVolumeUp" @change="settingsChanged" />
          </YTMDSetting>
          <YTMDSetting type="custom" name="Decrease Volume">
            <template #name>
              <span class="shortcut-title"
                ><SettingsSearchText text="Decrease Volume" :query="query" /><span
                  v-if="shortcutsVolumeDownRegisterFailed"
                  class="material-symbols-outlined register-error"
                  title="Failed to register keybind. Does another application have this keybind?"
                  >error</span
                >
              </span>
            </template>
            <KeybindInput v-model="shortcutVolumeDown" @change="settingsChanged" />
          </YTMDSetting>
          <YTMDSetting type="custom" name="Mini player">
            <template #name>
              <span class="shortcut-title"
                ><SettingsSearchText text="Mini player" :query="query" /><span
                  v-if="shortcutsMiniPlayerRegisterFailed"
                  class="material-symbols-outlined register-error"
                  title="Failed to register keybind. Does another application have this keybind?"
                  >error</span
                >
              </span>
            </template>
            <KeybindInput v-model="shortcutMiniPlayer" @change="settingsChanged" />
          </YTMDSetting>
          <YTMDSetting type="custom" name="Fullscreen lyrics">
            <template #name>
              <span class="shortcut-title"
                ><SettingsSearchText text="Fullscreen lyrics" :query="query" /><span
                  v-if="shortcutsLyricsFullscreenRegisterFailed"
                  class="material-symbols-outlined register-error"
                  title="Failed to register keybind. Does another application have this keybind?"
                  >error</span
                >
              </span>
            </template>
            <KeybindInput v-model="shortcutLyricsFullscreen" @change="settingsChanged" />
          </YTMDSetting>
        </SettingsSection>

        <SettingsSection
          v-show="sectionVisible(7)"
          :section="7"
          title="Listening stats"
          description="What you listened to, kept on this PC only."
          class="stats-tab"
        >
          <YTMDSetting
            v-model="listeningStatsEnabled"
            type="checkbox"
            name="Keep listening statistics"
            description="Listening time, top songs and artists. Stored on this PC only, nothing is sent anywhere."
            @change="settingsChanged"
          />
          <YTMDSetting v-if="!searching" type="custom" flex-column name="Your listening">
            <ListeningStats :active="currentTab === 7" />
          </YTMDSetting>
        </SettingsSection>

        <SettingsSection v-show="sectionVisible(6)" :section="6" title="Advanced" description="Customize styles and rendering behavior." class="advanced-tab">
          <YTMDSetting
            v-model="disableHardwareAcceleration"
            type="checkbox"
            restart-required
            name="Disable hardware acceleration"
            @change="settingChangedRequiresRestart"
          />
          <YTMDSetting
            v-model="customCSSEnabled"
            type="checkbox"
            name="Custom CSS"
            description="Choose a CSS file path to customize the player."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="customCSSEnabled || searching"
            v-model="customCSSPath"
            :disabled="!customCSSEnabled"
            disabled-message="Enable Custom CSS in Advanced to choose a file."
            type="file"
            indented
            bind-setting="appearance.customCSSPath"
            name="Custom CSS file path"
            @file-change="settingChangedFile"
            @clear="removeCustomCSSPath"
          />
          <YTMDSetting
            type="custom"
            flex-column
            name="Export and import settings"
            description="Save your settings to a file, for a backup or another PC. Sign-ins and authorized companions are not included."
          >
            <div class="transfer-actions">
              <button type="button" @click="exportSettings"><span class="material-symbols-outlined" aria-hidden="true">upload</span>Export</button>
              <button type="button" @click="importSettings"><span class="material-symbols-outlined" aria-hidden="true">download</span>Import</button>
            </div>
            <p v-if="transferMessage" class="transfer-message" :class="{ error: transferMessage.error }" role="status">{{ transferMessage.text }}</p>
          </YTMDSetting>
        </SettingsSection>

        <SettingsSection v-show="sectionVisible(99)" :section="99" title="About" description="App information and updates." class="about-tab">
          <YTMDSetting
            type="custom"
            name="YouTube Music Premium"
            :description="`Version ${ytmdVersion}. Check for updates, app information and GitHub.`"
            flex-column
            class="about-details"
          >
            <img class="icon" :src="logo" alt="YouTube Music Premium logo" />
            <p class="made-by">Made by Skorbjen and 4tjoi</p>
            <template v-if="!autoUpdaterDisabled">
              <button
                v-if="!updateDownloaded"
                :disabled="!(!checkingForUpdate && !updateAvailable && !updateDownloaded)"
                class="update-check-button"
                @click="checkForUpdates"
              >
                <span class="material-symbols-outlined">update</span>Check for updates
              </button>
              <button v-if="updateDownloaded" class="update-button" @click="restartApplicationForUpdate">
                <span class="material-symbols-outlined">upgrade</span>Restart to update
              </button>
              <p v-if="checkingForUpdate && !updateAvailable && !updateDownloaded" class="updating">
                <span class="material-symbols-outlined">progress_activity</span>Checking for updates...
              </p>
              <p v-if="updateAvailable && !updateDownloaded" class="updating">
                <span class="material-symbols-outlined">progress_activity</span>Downloading update...
              </p>
              <p v-if="updateNotAvailable" class="no-update">Update not available</p>
            </template>
            <template v-if="autoUpdaterDisabled">
              <button disabled class="update-check-button"><span class="material-symbols-outlined">update</span>Check for updates</button>
              <p class="no-auto-updater">Auto updater disabled</p>
            </template>
            <div class="version-info">
              <p class="version">Version: {{ ytmdVersion }}</p>
              <p class="branch">Branch: {{ ytmdBranch }}</p>
              <p class="commit">Commit: {{ ytmdCommitHash }}</p>
            </div>
            <div class="links">
              <button type="button" class="whats-new-button" @click="showWhatsNew">
                <span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>What's new
              </button>
              <a href="https://github.com/v3slx/youtube-music-premium" target="_blank">GitHub</a>
            </div>
          </YTMDSetting>
        </SettingsSection>
      </main>
    </div>
  </div>
</template>

<style scoped>
.settings-container.settings {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  color: var(--ytmd-text);
  background: var(--ytmd-background);
  border-top: 1px solid var(--ytmd-border);
  font-size: 13px;
  user-select: none;
}

.settings-toolbar {
  display: grid;
  grid-template-columns: 156px minmax(0, 1fr);
  align-items: center;
  gap: 24px;
  padding: 22px 24px 20px;
  border-bottom: 1px solid var(--ytmd-border);
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.5px;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  min-height: 40px;
  background: var(--ytmd-surface);
  border: 1px solid var(--ytmd-border);
  border-radius: 8px;
  color: var(--ytmd-muted);
}

.search-field:focus-within {
  border-color: var(--ytmd-accent);
  outline: 1px solid var(--ytmd-accent);
}

.search-field input {
  width: 100%;
  min-width: 0;
  padding: 10px 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--ytmd-text);
}

.search-field input::placeholder {
  color: var(--ytmd-muted);
}

.search-field input::-webkit-search-cancel-button {
  display: none;
}

.content-container {
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 20px 12px;
  overflow-y: auto;
  border-right: 1px solid var(--ytmd-border);
  background: var(--ytmd-surface);
}

button {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid var(--ytmd-border);
  border-radius: 6px;
  color: var(--ytmd-text);
  background: var(--ytmd-raised);
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease;
}

button:hover:not(:disabled) {
  background: var(--ytmd-hover);
}

button:active:not(:disabled) {
  border-color: var(--ytmd-muted);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--ytmd-accent);
  outline-offset: 3px;
}

.sidebar button {
  flex-shrink: 0;
  justify-content: flex-start;
  gap: 10px;
  min-height: 40px;
  padding: 9px 12px;
  border-color: transparent;
  background: transparent;
  color: var(--ytmd-muted);
  text-align: left;
}

.sidebar button.active {
  color: var(--ytmd-text);
  background: var(--ytmd-raised);
  font-weight: 600;
}

.sidebar button.active .material-symbols-outlined {
  color: var(--ytmd-accent);
}

.sidebar button.about-link {
  margin-top: auto;
}

.material-symbols-outlined {
  font-size: 20px;
}

.sidebar-empty,
.search-summary {
  margin: 0 0 16px;
  color: var(--ytmd-muted);
  font-size: 12px;
  line-height: 1.6;
}

.match-count {
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.content {
  min-width: 0;
  padding: 24px 28px 32px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scroll-padding-top: 24px;
}

.content,
.sidebar {
  scrollbar-width: thin;
  scrollbar-color: var(--ytmd-hover) transparent;
}

.content > :first-child {
  margin-top: 0;
}

.content.searching :deep(.settings-section) {
  margin-top: 24px;
}

.empty-search {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 32px 0;
}

.empty-search > .material-symbols-outlined {
  font-size: 32px;
  color: var(--ytmd-muted);
}

.empty-search h2,
.empty-search p {
  margin: 0;
}

.empty-search h2 {
  font-size: 20px;
  font-weight: 500;
}

.empty-search p {
  color: var(--ytmd-muted);
  line-height: 1.6;
}

.search-field .clear-search {
  min-height: 26px;
  padding: 3px;
  border: 0;
  background: transparent;
}

.restart-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 12px;
  border: 1px solid var(--ytmd-border);
  border-radius: 8px;
  background: var(--ytmd-surface);
}

.restart-banner .message {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  line-height: 1.5;
}

.restart-banner .material-symbols-outlined {
  color: var(--ytmd-accent);
}

.restart-banner button,
.update-button {
  background: var(--ytmd-accent);
  color: var(--ytmd-on-accent);
  border-color: transparent;
}

.restart-banner button:hover,
.update-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ytmd-accent) 85%, white);
}

.setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  line-height: 1.6;
}

.name-with-description p {
  margin: 0;
  line-height: 1.6;
}

.discord-failure {
  margin: 0;
  color: var(--ytmd-muted);
  font:
    12px/1.7 "Open Sans",
    sans-serif;
}

.discord-connected,
.status-success {
  color: var(--ytmd-success);
}

.discord-connected {
  margin: 0 0 6px;
}

.status-error,
.register-error {
  color: var(--ytmd-danger);
}

.discord-client-id {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--ytmd-border);
  border-radius: 6px;
  background: var(--ytmd-raised);
}

a {
  color: var(--ytmd-text);
  text-underline-offset: 3px;
}

a:hover {
  color: var(--ytmd-accent);
}

.discord-portal-link {
  font-size: 12px;
}

.audio-output-actions {
  display: flex;
  flex-basis: 100%;
  justify-content: flex-end;
}

.transfer-actions {
  display: flex;
  gap: 8px;
}

.transfer-message {
  margin: 0;
  color: var(--ytmd-success);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  user-select: text;
}

.transfer-message.error {
  color: var(--ytmd-danger);
}

.links {
  display: flex;
  align-items: center;
  gap: 16px;
}

.authorized-companions-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 12px;
}

.authorized-companions-table th,
.authorized-companions-table td {
  padding: 8px 4px;
  text-align: left;
  overflow-wrap: anywhere;
}

.authorized-companions-table th {
  color: var(--ytmd-muted);
  font-weight: 500;
  border-bottom: 1px solid var(--ytmd-border);
}

.authorized-companions-table .companion {
  width: 60%;
}

.authorized-companions-table .controls {
  width: 38px;
}

.authorized-companions-table .id,
.no-authorized-companions {
  color: var(--ytmd-muted);
}

.authorized-companions-table button {
  padding: 6px;
}

.shortcut-title {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.shortcuts-tab :deep(.keybind) {
  min-width: 0;
  width: 206px;
  border: 1px solid var(--ytmd-border);
  border-radius: 6px;
  background: var(--ytmd-raised);
}

.shortcuts-tab :deep(.keybind.is-editing),
.shortcuts-tab :deep(.keybind:focus-within) {
  outline: 2px solid var(--ytmd-accent);
  outline-offset: 2px;
}

.shortcuts-tab :deep(.keybind-text) {
  flex: 1;
  min-width: 0;
  width: auto;
  height: auto;
  padding: 9px 10px;
  background: transparent;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.shortcuts-tab :deep(.remove) {
  border-color: var(--ytmd-border);
  color: var(--ytmd-muted);
  background: transparent;
}

.shortcuts-tab :deep(.remove:hover:not(:disabled)) {
  color: var(--ytmd-text);
  background: var(--ytmd-hover);
}

.icon {
  width: 64px;
  height: 64px;
}

.about-details {
  gap: 16px;
  align-items: flex-start;
}

.made-by,
.version-info p,
.updating,
.no-update,
.no-auto-updater {
  margin: 0;
  color: var(--ytmd-muted);
  line-height: 1.6;
}

.version-info {
  user-select: text;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.updating {
  display: flex;
  align-items: center;
  gap: 8px;
}

.updating .material-symbols-outlined {
  animation: rotation 1.5s linear infinite;
}

@keyframes rotation {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .settings-toolbar {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 16px;
  }
  .content-container {
    grid-template-columns: 150px minmax(0, 1fr);
  }
  .sidebar {
    padding: 16px 8px;
  }
  .sidebar button {
    padding: 9px 8px;
    gap: 6px;
  }
  .content {
    padding: 20px 16px;
  }
  .shortcuts-tab :deep(.keybind) {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
  .updating .material-symbols-outlined {
    animation: none;
  }
}
</style>
