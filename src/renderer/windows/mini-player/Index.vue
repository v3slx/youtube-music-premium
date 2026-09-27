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
  <div class="mini-player" :class="{ 'has-video': state?.hasVideo }">
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
        <span class="material-symbols-outlined" aria-hidden="true">keep</span>
      </button>
      <button type="button" class="icon-button" title="Open YouTube Music Premium" @click="miniPlayer.showMainWindow()">
        <span class="material-symbols-outlined" aria-hidden="true">open_in_full</span>
      </button>
      <button type="button" class="icon-button" title="Close mini player" @click="miniPlayer.close()">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
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
            <span class="material-symbols-outlined" aria-hidden="true">skip_previous</span>
          </button>
          <button type="button" class="play-button" :title="state.playing ? 'Pause' : 'Play'" @click="miniPlayer.command('playPause')">
            <span class="material-symbols-outlined filled" aria-hidden="true">{{ state.playing ? "pause" : "play_arrow" }}</span>
          </button>
          <button type="button" class="icon-button" title="Next" @click="miniPlayer.command('next')">
            <span class="material-symbols-outlined" aria-hidden="true">skip_next</span>
          </button>
          <button
            type="button"
            class="icon-button like"
            :class="{ active: liked }"
            :title="liked ? 'Remove like' : 'Like'"
            :aria-pressed="liked"
            @click="miniPlayer.command('toggleLike')"
          >
            <span class="material-symbols-outlined" :class="{ filled: liked }" aria-hidden="true">thumb_up</span>
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
  padding: 12px 14px 15px 12px;
  overflow: hidden;
  background: var(--ytmd-surface);
  color: var(--ytmd-text);
  font-family: "Work Sans", sans-serif;
  user-select: none;
  -webkit-app-region: drag;
  transition: background-color 600ms ease;
}

.backdrop {
  position: absolute;
  inset: -40px;
  background-position: center;
  background-size: cover;
  filter: blur(32px) saturate(1.3);
  opacity: 0.35;
  pointer-events: none;
}

.backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, color-mix(in srgb, var(--ytmd-background) 55%, transparent), var(--ytmd-background));
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
  height: min(calc(100vh - 27px), 168px);
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 40%);
}

.details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

p {
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title {
  padding-right: 88px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.subtitle {
  color: var(--ytmd-muted);
  font-size: 12px;
  line-height: 1.4;
}

.lyric {
  margin-top: 2px;
  color: var(--ytmd-accent);
  font-size: 12px;
  font-style: italic;
  line-height: 1.4;
}

.controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
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
    transform 100ms ease;
}

button:active {
  transform: scale(0.92);
}

.icon-button {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: var(--ytmd-muted);
}

.icon-button:hover {
  color: var(--ytmd-text);
  background: color-mix(in srgb, var(--ytmd-text) 10%, transparent);
}

.icon-button.active,
.like.active {
  color: var(--ytmd-accent);
}

.play-button {
  width: 36px;
  height: 36px;
  margin: 0 2px;
  border-radius: 50%;
  color: var(--ytmd-background);
  background: var(--ytmd-text);
}

.play-button:hover {
  background: color-mix(in srgb, var(--ytmd-text) 85%, var(--ytmd-accent));
}

.material-symbols-outlined {
  font-size: 22px;
}

.material-symbols-outlined.filled {
  font-variation-settings: "FILL" 1;
}

.time {
  margin-left: auto;
  padding-left: 8px;
  color: var(--ytmd-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.window-buttons {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 150ms ease;
}

.window-buttons .icon-button {
  width: 26px;
  height: 26px;
}

.window-buttons .material-symbols-outlined {
  font-size: 17px;
}

.mini-player:hover .window-buttons,
.window-buttons:focus-within {
  opacity: 1;
}

.progress {
  -webkit-app-region: no-drag;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  cursor: pointer;
  background: color-mix(in srgb, var(--ytmd-text) 14%, transparent);
  transition: height 120ms ease;
}

.progress:hover {
  height: 7px;
}

.progress-fill {
  height: 100%;
  background: var(--ytmd-accent);
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
    opacity 180ms ease,
    transform 180ms ease;
}

.lyric-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.lyric-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-height: 110px) {
  .cover {
    height: calc(100vh - 24px);
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
  button,
  .window-buttons,
  .progress,
  .lyric-enter-active,
  .lyric-leave-active {
    transition: none;
  }
}
</style>
