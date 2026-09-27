<script setup lang="ts">
import { onBeforeMount, ref } from "vue";
import { useTheme } from "../composables/useTheme";

useTheme();

const props = defineProps({
  title: {
    type: String,
    default: null
  },
  icon: {
    type: String,
    default: null
  },
  iconFile: {
    type: String,
    default: null
  },
  hasHomeButton: Boolean,
  hasMiniPlayerButton: Boolean,
  hasSettingsButton: Boolean,
  hasMinimizeButton: Boolean,
  hasMaximizeButton: Boolean,
  centerTitleText: Boolean,
  isMainWindow: {
    type: Boolean,
    default: false
  }
});

const minimizeWindow = window.ytmd.minimizeWindow;
const maximizeWindow = window.ytmd.maximizeWindow;
const restoreWindow = window.ytmd.restoreWindow;
const closeWindow = window.ytmd.closeWindow;

const openSettingsWindow = window.ytmd.openSettingsWindow;
const toggleMiniPlayer = window.ytmd.toggleMiniPlayer;
const navigateToDefault = window.ytmd.ytmViewNavigateDefault;

const wcoVisible = ref(window.navigator.windowControlsOverlay.visible);
const windowMaximized = ref(false);
const windowFullscreen = ref(false);

window.ytmd.handleWindowEvents((event, state) => {
  windowMaximized.value = state.maximized;
  windowFullscreen.value = state.fullscreen;
});

window.navigator.windowControlsOverlay.addEventListener("geometrychange", event => {
  wcoVisible.value = event.visible;
});

function restartApplicationForUpdate() {
  window.ytmd.restartApplicationForUpdate();
}

const ytmViewUnresponsive = ref<boolean>(false);
const appUpdateDownloaded = ref<boolean>(false);

if (props.isMainWindow) {
  const memoryStore = window.ytmd.memoryStore;

  onBeforeMount(async () => {
    ytmViewUnresponsive.value = (await memoryStore.get("ytmViewUnresponsive")) ?? false;
    appUpdateDownloaded.value = (await memoryStore.get("appUpdateDownloaded")) ?? false;
  });

  memoryStore.onStateChanged(newState => {
    ytmViewUnresponsive.value = newState.ytmViewUnresponsive;
    appUpdateDownloaded.value = newState.appUpdateDownloaded;
  });
}
</script>

<template>
  <div v-if="!windowFullscreen" class="titlebar">
    <div class="left">
      <div class="title">
        <span v-if="icon" class="icon material-symbols-outlined" aria-hidden="true">{{ icon }}</span>
        <img v-if="iconFile" class="icon" :src="iconFile" alt="" draggable="false" />
        <p v-if="title && !centerTitleText" class="title-text">{{ title }}{{ ytmViewUnresponsive ? " (Unresponsive)" : "" }}</p>
      </div>
    </div>
    <div v-if="title && centerTitleText" class="center">
      <p class="title-text">{{ title }}{{ ytmViewUnresponsive ? " (Unresponsive)" : "" }}</p>
    </div>
    <div class="right">
      <div v-if="isMainWindow" class="update-buttons">
        <button
          v-if="appUpdateDownloaded"
          type="button"
          class="app-button update-button"
          tabindex="1"
          title="Restart to update"
          aria-label="Restart to update"
          @click="restartApplicationForUpdate"
        >
          <span class="material-symbols-outlined" aria-hidden="true">upgrade</span>
        </button>
      </div>
      <div class="app-buttons">
        <slot name="app-buttons"></slot>
        <button v-if="hasHomeButton" type="button" class="app-button" tabindex="2" title="Home" aria-label="Home" @click="navigateToDefault">
          <span class="material-symbols-outlined" aria-hidden="true">home</span>
        </button>
        <button
          v-if="hasMiniPlayerButton"
          type="button"
          class="app-button"
          tabindex="3"
          title="Mini player"
          aria-label="Open or close the mini player"
          @click="toggleMiniPlayer"
        >
          <span class="material-symbols-outlined" aria-hidden="true">picture_in_picture_alt</span>
        </button>
        <button v-if="hasSettingsButton" type="button" class="app-button" tabindex="3" title="Settings" aria-label="Settings" @click="openSettingsWindow">
          <span class="material-symbols-outlined" aria-hidden="true">settings</span>
        </button>
      </div>
      <div v-if="!wcoVisible" class="windows-action-buttons">
        <button
          v-if="hasMinimizeButton"
          type="button"
          class="action-button window-minimize"
          tabindex="4"
          title="Minimize"
          aria-label="Minimize window"
          @click="minimizeWindow"
        >
          <span class="material-symbols-outlined" aria-hidden="true">remove</span>
        </button>
        <button
          v-if="hasMaximizeButton && !windowMaximized"
          type="button"
          class="action-button window-maximize"
          tabindex="5"
          title="Maximize"
          aria-label="Maximize window"
          @click="maximizeWindow"
        >
          <span class="material-symbols-outlined" aria-hidden="true">square</span>
        </button>
        <button
          v-if="hasMaximizeButton && windowMaximized"
          type="button"
          class="action-button window-restore"
          tabindex="6"
          title="Restore"
          aria-label="Restore window"
          @click="restoreWindow"
        >
          <span class="material-symbols-outlined" aria-hidden="true">filter_none</span>
        </button>
        <button type="button" class="action-button window-close" tabindex="7" title="Close" aria-label="Close window" @click="closeWindow">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  box-sizing: border-box;
  position: relative;
  left: env(titlebar-area-x, 0);
  width: env(titlebar-area-width, 100%);
  height: 36px;
  flex-shrink: 0;
  user-select: none;
  -webkit-app-region: drag;
  background-color: var(--ytmd-background, #101113);
  color: var(--ytmd-text, #eeeeee);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.titlebar .left,
.titlebar .right {
  display: flex;
  align-items: center;
}

.titlebar .left {
  min-width: 0;
  padding: 0 12px;
}

.titlebar .right {
  flex-shrink: 0;
  height: 100%;
  gap: 8px;
}

.titlebar .center {
  position: absolute;
  left: 50%;
  max-width: 45%;
  transform: translateX(-50%);
  pointer-events: none;
}

.titlebar .right .app-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}

.titlebar .right .app-buttons:empty,
.update-buttons:empty {
  display: none;
}

.app-buttons,
.update-buttons,
.windows-action-buttons {
  -webkit-app-region: no-drag;
}

.title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.title .icon {
  flex-shrink: 0;
  color: var(--ytmd-muted, #a3a5ad);
  font-variation-settings:
    "FILL" 0,
    "wght" 300,
    "GRAD" 0,
    "opsz" 24;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.title .icon.material-symbols-outlined {
  font-size: 18px;
}

.title-text {
  margin: 0;
  font-family: "Work Sans", sans-serif;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 1.4;
  font-weight: 500;
}

.app-button,
.action-button {
  box-sizing: border-box;
  padding: 0;
  background: none;
  color: var(--ytmd-muted, #a3a5ad);
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
  border: none;
  font-variation-settings:
    "FILL" 0,
    "wght" 300,
    "GRAD" 0,
    "opsz" 20;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.app-button {
  height: 28px;
  width: 30px;
  border-radius: 6px;
}

.app-button:hover,
.action-button:hover {
  background-color: var(--ytmd-hover, #25272d);
  color: var(--ytmd-text, #eeeeee);
}

.app-button:focus-visible,
.action-button:focus-visible {
  outline: 2px solid var(--ytmd-accent, #ff626b);
  outline-offset: -3px;
}

.app-button:active,
.action-button:active {
  background-color: var(--ytmd-raised, #303239);
}

.app-button > .material-symbols-outlined {
  font-size: 20px;
}

.app-buttons :deep(.divider) {
  align-self: center;
  height: 16px;
  margin: 0 4px;
  border-left: 1px solid var(--ytmd-border, #303239);
  pointer-events: none;
}

.action-button {
  width: 40px;
  height: 36px;
  border-radius: 0;
}

.action-button > .material-symbols-outlined {
  font-size: 18px;
}

.windows-action-buttons {
  display: flex;
  height: 100%;
}

.window-restore > .material-symbols-outlined {
  transform: rotate(180deg);
}

.window-close:hover,
.window-close:active {
  color: #ffffff;
  background-color: #c93542;
}

.window-close:focus-visible {
  outline-color: var(--ytmd-text, #eeeeee);
}

.update-button {
  color: var(--ytmd-accent, #ff626b);
}

@media (prefers-reduced-motion: reduce) {
  .app-button,
  .action-button {
    transition: none;
  }
}
</style>
