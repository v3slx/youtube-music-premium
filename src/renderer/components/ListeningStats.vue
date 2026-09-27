<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ListeningStatsSummary } from "~shared/types";

const props = defineProps<{ active: boolean }>();

const stats = ref<ListeningStatsSummary | null>(null);
const confirmingClear = ref(false);
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let confirmTimer: ReturnType<typeof setTimeout> | null = null;

async function refresh() {
  if (!props.active) return;
  stats.value = await window.ytmd.getListeningStats();
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return seconds > 0 ? "< 1 min" : "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const maxDay = computed(() => Math.max(1, ...(stats.value?.days.map(day => day.seconds) ?? [0])));
const days = computed(() =>
  (stats.value?.days ?? []).map(day => {
    const date = new Date(`${day.date}T12:00:00`);
    return {
      ...day,
      label: date.toLocaleDateString("en", { weekday: "narrow" }),
      title: `${date.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })}: ${formatDuration(day.seconds)}`,
      height: Math.max(day.seconds > 0 ? 4 : 0, Math.round((day.seconds / maxDay.value) * 100))
    };
  })
);
const hasData = computed(() => (stats.value?.totalSeconds ?? 0) > 0);
const since = computed(() =>
  stats.value?.since ? new Date(stats.value.since).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" }) : null
);

async function clearStats() {
  if (!confirmingClear.value) {
    confirmingClear.value = true;
    confirmTimer = setTimeout(() => (confirmingClear.value = false), 4000);
    return;
  }
  if (confirmTimer) clearTimeout(confirmTimer);
  confirmingClear.value = false;
  await window.ytmd.clearListeningStats();
  await refresh();
}

// The settings keep every tab mounted, so load again whenever this tab is shown
watch(
  () => props.active,
  active => {
    if (active) void refresh();
  }
);

onMounted(() => {
  void refresh();
  refreshTimer = setInterval(() => void refresh(), 30 * 1000);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (confirmTimer) clearTimeout(confirmTimer);
});

defineExpose({ refresh });
</script>

<template>
  <div class="listening-stats">
    <div v-if="!hasData" class="empty">
      <span class="material-symbols-outlined" aria-hidden="true">graphic_eq</span>
      <p>No listening statistics yet. Play a few songs and they show up here.</p>
    </div>

    <template v-else-if="stats">
      <div class="cards">
        <div class="card">
          <span class="label">Today</span>
          <span class="value">{{ formatDuration(stats.todaySeconds) }}</span>
        </div>
        <div class="card">
          <span class="label">Last 7 days</span>
          <span class="value">{{ formatDuration(stats.weekSeconds) }}</span>
        </div>
        <div class="card">
          <span class="label">All time</span>
          <span class="value">{{ formatDuration(stats.totalSeconds) }}</span>
        </div>
        <div class="card">
          <span class="label">Plays</span>
          <span class="value">{{ stats.totalPlays }}</span>
        </div>
      </div>

      <div class="chart" role="img" :aria-label="`Listening time over the last 14 days`">
        <div v-for="day in days" :key="day.date" class="bar-column" :title="day.title">
          <div class="bar-track">
            <div class="bar" :style="{ height: `${day.height}%` }"></div>
          </div>
          <span class="bar-label">{{ day.label }}</span>
        </div>
      </div>

      <div class="lists">
        <section>
          <h3>Top songs</h3>
          <ol class="songs">
            <li v-for="song in stats.topSongs" :key="song.videoId">
              <img v-if="song.thumbnail" :src="song.thumbnail" alt="" loading="lazy" />
              <span v-else class="cover-placeholder material-symbols-outlined" aria-hidden="true">music_note</span>
              <span class="song-text">
                <span class="song-title" :title="song.title">{{ song.title }}</span>
                <span class="song-meta">{{ song.author }}</span>
              </span>
              <span class="numbers">{{ plural(song.plays, "play") }}<br />{{ formatDuration(song.seconds) }}</span>
            </li>
          </ol>
        </section>
        <section>
          <h3>Top artists</h3>
          <ol class="artists">
            <li v-for="(artist, index) in stats.topArtists" :key="artist.name">
              <span class="rank">{{ index + 1 }}</span>
              <span class="artist-name" :title="artist.name">{{ artist.name }}</span>
              <span class="numbers">{{ formatDuration(artist.seconds) }}</span>
            </li>
          </ol>
        </section>
      </div>
    </template>

    <div class="footer">
      <p class="note">
        Kept on this PC only<template v-if="since">, since {{ since }}</template
        >. Time counts while a song plays; a song counts as played after 30 seconds.
      </p>
      <button type="button" :class="{ danger: confirmingClear }" :disabled="!hasData" @click="clearStats">
        <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        {{ confirmingClear ? "Click again to clear" : "Clear statistics" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.listening-stats {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

.empty {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border: 1px dashed var(--ytmd-border);
  border-radius: 10px;
  color: var(--ytmd-muted);
}

.empty p {
  margin: 0;
  line-height: 1.6;
}

.cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--ytmd-border);
  border-radius: 10px;
  background: var(--ytmd-surface);
}

.label {
  color: var(--ytmd-muted);
  font-size: 11px;
}

.value {
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.chart {
  display: grid;
  grid-template-columns: repeat(14, minmax(0, 1fr));
  gap: 6px;
  height: 120px;
  padding: 12px 12px 8px;
  border: 1px solid var(--ytmd-border);
  border-radius: 10px;
  background: var(--ytmd-surface);
}

.bar-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-height: 0;
}

.bar-track {
  display: flex;
  align-items: flex-end;
  flex: 1;
  width: 100%;
  min-height: 0;
}

.bar {
  width: 100%;
  border-radius: 4px 4px 2px 2px;
  background: var(--ytmd-accent);
  transition: height 300ms ease;
}

.bar-label {
  color: var(--ytmd-muted);
  font-size: 10px;
}

.lists {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 16px;
}

h3 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ytmd-border) 60%, transparent);
}

li:last-child {
  border-bottom: none;
}

.songs img,
.cover-placeholder {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 4px;
  object-fit: cover;
}

.cover-placeholder {
  display: grid;
  place-items: center;
  background: var(--ytmd-raised);
  color: var(--ytmd-muted);
  font-size: 18px;
}

.song-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.song-title,
.song-meta,
.artist-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.song-title {
  font-size: 12.5px;
  font-weight: 500;
}

.song-meta {
  color: var(--ytmd-muted);
  font-size: 11.5px;
}

.numbers {
  flex-shrink: 0;
  color: var(--ytmd-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  line-height: 1.4;
}

.rank {
  width: 18px;
  flex-shrink: 0;
  color: var(--ytmd-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.artist-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.note {
  margin: 0;
  color: var(--ytmd-muted);
  font-size: 11.5px;
  line-height: 1.6;
}

button {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid var(--ytmd-border);
  border-radius: 6px;
  color: var(--ytmd-text);
  background: var(--ytmd-raised);
  font: inherit;
  cursor: pointer;
  transition: background-color 160ms ease;
}

button:hover:not(:disabled) {
  background: var(--ytmd-hover);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

button.danger {
  color: var(--ytmd-danger);
  border-color: var(--ytmd-danger);
}

button:focus-visible {
  outline: 2px solid var(--ytmd-accent);
  outline-offset: 2px;
}

button .material-symbols-outlined {
  font-size: 18px;
}

@media (max-width: 640px) {
  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .lists {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bar,
  button {
    transition: none;
  }
}
</style>
