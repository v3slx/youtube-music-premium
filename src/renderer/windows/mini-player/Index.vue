<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { MiniPlayerState } from "~shared/types";
import { useTheme } from "../../composables/useTheme";
import logo from "~assets/icons/ytmd_white.png";

useTheme();

const miniPlayer = window.ytmd.miniPlayer;
const state = ref<MiniPlayerState | null>(null);
const now = ref(Date.now());

miniPlayer.onState(newState => {
  state.value = newState;
  now.value = Date.now();
});

// Progress counts on between updates from the main process, so the bar moves smoothly
let frame = 0;
function tick() {
  now.value = Date.now();
  frame = requestAnimationFrame(tick);
}

const progress = computed(() => {
  const s = state.value;
  if (!s || !s.hasVideo) return 0;
  const elapsed = s.playing ? (now.value - s.progressAt) / 1000 : 0;
  return Math.min(s.durationSeconds || 0, Math.max(0, s.progress + elapsed));
});
const progressFraction = computed(() => {
  const duration = state.value?.durationSeconds ?? 0;
  return duration > 0 ? progress.value / duration : 0;
});
const liked = computed(() => state.value?.likeStatus === 2);

// Drawn icons: the bundled icon font has no pin, and SVG stays sharp at these small sizes
const icons = {
  pin: "M16 9V4h1a1 1 0 1 0 0-2H7a1 1 0 0 0 0 2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z",
  openApp: "M21 11V3h-8l3.29 3.29-10 10L3 13v8h8l-3.29-3.29 10-10z",
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  previous: "M7 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1zm11 .87v10.26a1 1 0 0 1-1.55.83L9.2 12.83a1 1 0 0 1 0-1.66l7.25-5.13A1 1 0 0 1 18 6.87z",
  next: "M17 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1zM6 6.87v10.26a1 1 0 0 0 1.55.83l7.25-5.13a1 1 0 0 0 0-1.66L7.55 6.04A1 1 0 0 0 6 6.87z",
  play: "M8 5.14v13.72a1 1 0 0 0 1.52.85l10.29-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z",
  pause: "M7 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm7 0h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  like: "M9 21h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.58 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2zm0-12 4.34-4.34L12 10h9v2l-3 7H9V9zM1 9h4v12H1z",
  liked:
    "M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
};

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

const subtitle = computed(() => {
  const s = state.value;
  if (!s) return "";
  return s.album && s.album.trim().toLowerCase() !== s.title.trim().toLowerCase() ? `${s.author} · ${s.album}` : s.author;
});

watch(
  () => state.value?.title,
  title => {
    document.title = title ? `${title} · Mini player` : "Mini player";
  }
);

function seek(event: MouseEvent) {
  const s = state.value;
  if (!s?.hasVideo || s.isLive || !s.durationSeconds) return;
  const bar = event.currentTarget as HTMLElement;
  const rect = bar.getBoundingClientRect();
  const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  miniPlayer.command("seekTo", Math.round(fraction * s.durationSeconds));
}

function onKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter")) return;
  const s = state.value;
  if (event.key === " ") {
    event.preventDefault();
    miniPlayer.command("playPause");
  } else if (event.key === "ArrowRight" && s?.hasVideo && !s.isLive) {
    miniPlayer.command("seekTo", Math.min(s.durationSeconds, Math.round(progress.value + 10)));
  } else if (event.key === "ArrowLeft" && s?.hasVideo && !s.isLive) {
    miniPlayer.command("seekTo", Math.max(0, Math.round(progress.value - 10)));
  }
}

onMounted(() => {
  miniPlayer.requestState();
  frame = requestAnimationFrame(tick);
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="mini-player" :class="{ 'has-video': state?.hasVideo, 'paused': state?.hasVideo && !state.playing }">
    <div v-if="state?.hasVideo && state.thumbnail" class="backdrop" :style="{ backgroundImage: `url(${state.thumbnail})` }" aria-hidden="true"></div>

    <div class="window-buttons">
      <button
        type="button"
        class="icon-button"
        :class="{ active: state?.alwaysOnTop }"
        :title="state?.alwaysOnTop ? 'Stop keeping on top' : 'Keep on top'"
        :aria-pressed="state?.alwaysOnTop ?? false"
        @click="miniPlayer.setAlwaysOnTop(!state?.alwaysOnTop)"
      >
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.pin" /></svg>
      </button>
      <button type="button" class="icon-button" title="Open YouTube Music Premium" @click="miniPlayer.showMainWindow()">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.openApp" /></svg>
      </button>
      <button type="button" class="icon-button" title="Close mini player" @click="miniPlayer.close()">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.close" /></svg>
      </button>
    </div>

    <template v-if="state?.hasVideo">
      <img class="cover" :src="state.thumbnail ?? logo" alt="" draggable="false" />
      <div class="details">
        <p class="title" :title="state.title">{{ state.title }}</p>
        <p class="subtitle" :title="subtitle">{{ subtitle }}</p>
        <Transition name="lyric" mode="out-in">
          <p v-if="state.lyricsLine" :key="state.lyricsLine" class="lyric">{{ state.lyricsLine }}</p>
        </Transition>
        <div class="controls">
          <button type="button" class="icon-button" title="Previous" @click="miniPlayer.command('previous')">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.previous" /></svg>
          </button>
          <button type="button" class="play-button" :title="state.playing ? 'Pause' : 'Play'" @click="miniPlayer.command('playPause')">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="state.playing ? icons.pause : icons.play" /></svg>
          </button>
          <button type="button" class="icon-button" title="Next" @click="miniPlayer.command('next')">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.next" /></svg>
          </button>
          <button
            type="button"
            class="icon-button like"
            :class="{ active: liked }"
            :title="liked ? 'Remove like' : 'Like'"
            :aria-pressed="liked"
            @click="miniPlayer.command('toggleLike')"
          >
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="liked ? icons.liked : icons.like" /></svg>
          </button>
          <span class="time">
            <template v-if="state.isLive">LIVE</template>
            <template v-else>{{ formatTime(progress) }} / {{ formatTime(state.durationSeconds) }}</template>
          </span>
        </div>
      </div>
      <div
        class="progress"
        role="slider"
        aria-label="Song position"
        :aria-valuemin="0"
        :aria-valuemax="state.durationSeconds"
        :aria-valuenow="Math.round(progress)"
        @click="seek"
      >
        <div class="progress-fill" :style="{ transform: `scaleX(${progressFraction})` }"></div>
      </div>
    </template>

    <div v-else class="empty">
      <img :src="logo" alt="" width="40" height="40" draggable="false" />
      <div>
        <p class="title">Nothing playing</p>
        <p class="subtitle">Start a song in YouTube Music Premium</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mini-player {
  position: relative;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100vw;
  height: 100vh;
  padding: 12px 14px 16px 12px;
  overflow: hidden;
  background: var(--ytmd-background);
  color: var(--ytmd-text);
  font-family: "Work Sans", sans-serif;
  user-select: none;
  -webkit-app-region: drag;
  transition: background-color 600ms ease;
}

/* The album art, blurred behind everything, with a shade that keeps the text readable */
.backdrop {
  position: absolute;
  inset: -50px;
  background-position: center;
  background-size: cover;
  filter: blur(34px) saturate(1.5);
  opacity: 0.7;
  pointer-events: none;
  transition: background-image 600ms ease;
}

.backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    color-mix(in srgb, var(--ytmd-background) 30%, transparent),
    color-mix(in srgb, var(--ytmd-background) 78%, transparent) 62%
  );
}

.cover,
.details,
.empty,
.window-buttons,
.progress {
  position: relative;
}

.cover {
  flex-shrink: 0;
  height: min(calc(100vh - 28px), 168px);
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 10px;
  box-shadow:
    0 10px 26px rgb(0 0 0 / 45%),
    0 0 0 1px rgb(255 255 255 / 8%);
  transition: transform 450ms cubic-bezier(0.34, 1.35, 0.64, 1);
}

.paused .cover {
  transform: scale(0.93);
}

.details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

p {
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title {
  padding-right: 84px;
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.005em;
}

.subtitle {
  color: color-mix(in srgb, var(--ytmd-text) 70%, transparent);
  font-size: 12px;
  line-height: 1.4;
}

.lyric {
  margin-top: 4px;
  color: var(--ytmd-text);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;
  text-shadow: 0 1px 8px rgb(0 0 0 / 35%);
}

.controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

button {
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  color: inherit;
  background: transparent;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease,
    opacity 150ms ease,
    transform 120ms ease;
}

button:active {
  transform: scale(0.9);
}

.icon {
  display: block;
  width: 22px;
  height: 22px;
  fill: currentColor;
}

.icon-button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: color-mix(in srgb, var(--ytmd-text) 82%, transparent);
}

.icon-button:hover {
  color: var(--ytmd-text);
  background: color-mix(in srgb, var(--ytmd-text) 12%, transparent);
}

.icon-button.active,
.like.active {
  color: var(--ytmd-accent);
}

.play-button {
  width: 38px;
  height: 38px;
  margin: 0 2px;
  border-radius: 50%;
  color: #111;
  background: #fff;
  box-shadow: 0 4px 14px rgb(0 0 0 / 30%);
}

.play-button .icon {
  width: 22px;
  height: 22px;
}

.play-button:hover {
  transform: scale(1.06);
}

.play-button:active {
  transform: scale(0.94);
}

.time {
  margin-left: auto;
  padding-left: 8px;
  color: color-mix(in srgb, var(--ytmd-text) 70%, transparent);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/*
  Always there: the top right corner is part of the area that moves the window, and Windows doesn't report the
  mouse over it, so buttons that only showed on hover disappeared exactly when you reached for them.
*/
.window-buttons {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: flex;
  gap: 2px;
}

.window-buttons .icon-button {
  width: 26px;
  height: 26px;
  color: color-mix(in srgb, var(--ytmd-text) 55%, transparent);
}

.window-buttons .icon-button:hover {
  color: var(--ytmd-text);
}

.window-buttons .icon-button.active {
  color: var(--ytmd-accent);
}

.window-buttons .icon {
  width: 16px;
  height: 16px;
}

.progress {
  -webkit-app-region: no-drag;
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 6px;
  height: 4px;
  border-radius: 999px;
  overflow: hidden;
  cursor: pointer;
  background: color-mix(in srgb, var(--ytmd-text) 18%, transparent);
  transition: height 120ms ease;
}

/* A taller hit area than the bar itself */
.progress::before {
  content: "";
  position: absolute;
  inset: -6px 0;
}

.progress:hover {
  height: 6px;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--ytmd-text);
  transform-origin: left center;
}

.empty {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-left: 6px;
}

.empty .title {
  padding-right: 0;
}

button:focus-visible,
.progress:focus-visible {
  outline: 2px solid var(--ytmd-accent);
  outline-offset: 1px;
}

.lyric-enter-active,
.lyric-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease,
    filter 220ms ease;
}

.lyric-enter-from {
  opacity: 0;
  transform: translateY(6px);
  filter: blur(3px);
}

.lyric-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  filter: blur(3px);
}

@media (max-height: 110px) {
  .cover {
    height: calc(100vh - 26px);
  }
  .lyric {
    display: none;
  }
  .controls {
    margin-top: 2px;
  }
}

@media (max-width: 330px) {
  .time {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mini-player,
  .cover,
  button,
  .progress,
  .lyric-enter-active,
  .lyric-leave-active {
    transition: none;
  }
}
</style>
