<script setup lang="ts">
import { computed, onBeforeMount, ref } from "vue";
import logo from "~assets/icons/ytmd.png";

const memoryStore = window.ytmd.memoryStore;

const ytmViewLoading = ref<boolean>(await memoryStore.get("ytmViewLoading"));
const ytmViewLoadingError = ref<boolean>(await memoryStore.get("ytmViewLoadingError"));
const ytmViewLoadTimedout = ref<boolean>(await memoryStore.get("ytmViewLoadTimedout"));
const ytmViewLoadingStatus = ref<string>((await memoryStore.get("ytmViewLoadingStatus")) ?? "");
const needsRetry = computed(() => ytmViewLoadingError.value || ytmViewLoadTimedout.value);
const loadingTitle = computed(() => {
  if (ytmViewLoadingError.value) return "Unable to load YouTube Music";
  if (ytmViewLoadTimedout.value) return "Taking a little longer";
  return "Getting your music ready";
});

function retryLoading(): void {
  ytmViewLoadingError.value = false;
  ytmViewLoadTimedout.value = false;
  ytmViewLoadingStatus.value = "Reconnecting to YouTube Music...";

  // Recreating the view resets loading and timeout, but retains the previous error.
  memoryStore.set("ytmViewLoadingError", false);
  window.ytmd.ytmViewRecreate();
}

onBeforeMount(async () => {
  ytmViewLoading.value = await memoryStore.get("ytmViewLoading");
  ytmViewLoadTimedout.value = await memoryStore.get("ytmViewLoadTimedout");
  ytmViewLoadingError.value = await memoryStore.get("ytmViewLoadingError");
  ytmViewLoadingStatus.value = (await memoryStore.get("ytmViewLoadingStatus")) ?? "";
});

memoryStore.onStateChanged(newState => {
  ytmViewLoading.value = newState.ytmViewLoading;
  ytmViewLoadingError.value = newState.ytmViewLoadingError;
  ytmViewLoadTimedout.value = newState.ytmViewLoadTimedout;
  ytmViewLoadingStatus.value = newState.ytmViewLoadingStatus ?? "";
});
</script>

<template>
  <main class="ytmview-loading-container" aria-label="YouTube Music connection">
    <Transition name="fade">
      <section v-if="ytmViewLoading" class="ytmview-loading" aria-labelledby="loading-title">
        <img class="logo" :src="logo" alt="YouTube Music Desktop" width="72" height="72" />
        <div class="loading-message" role="status" aria-live="polite" aria-atomic="true">
          <h1 id="loading-title">{{ loadingTitle }}</h1>
          <p v-if="ytmViewLoadingError" class="loading-description">Check your internet connection, then try again.</p>
          <p v-else-if="ytmViewLoadTimedout" class="loading-description">YouTube Music is still loading. You can wait a moment or try again.</p>
          <p v-else class="loading-description">{{ ytmViewLoadingStatus || "Connecting to YouTube Music..." }}</p>
        </div>
        <button v-if="needsRetry" class="retry-button" type="button" @click="retryLoading">
          <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
          Try again
        </button>
        <div v-else class="music-loader" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <details v-if="needsRetry && ytmViewLoadingStatus" class="loading-details">
          <summary>Connection details</summary>
          <p>{{ ytmViewLoadingStatus }}</p>
        </details>
      </section>
    </Transition>
  </main>
</template>

<style scoped>
.ytmview-loading-container {
  height: calc(100% - 36px);
  overflow: auto;
  background-color: var(--ytmd-background, #111111);
  color: var(--ytmd-text, #eeeeee);
}

.ytmview-loading {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 100%;
  padding: 48px 24px;
  text-align: center;
}

.logo {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  margin-bottom: 28px;
  user-select: none;
}

.loading-message {
  width: 100%;
  max-width: 400px;
}

.loading-message h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 550;
  line-height: 1.3;
  letter-spacing: -0.5px;
  text-wrap: balance;
}

.loading-description {
  margin: 12px 0 0;
  color: var(--ytmd-muted, #aaaaaa);
  font-family: "Open Sans", sans-serif;
  font-size: 13px;
  line-height: 1.65;
  text-wrap: pretty;
}

.retry-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  margin-top: 24px;
  padding: 8px 18px;
  border: 1px solid var(--ytmd-border, #353535);
  border-radius: 8px;
  background-color: var(--ytmd-raised, #252525);
  color: var(--ytmd-text, #eeeeee);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease;
}

.retry-button:hover {
  border-color: var(--ytmd-muted, #aaaaaa);
  background-color: var(--ytmd-hover, #303030);
}

.retry-button:active {
  background-color: var(--ytmd-surface, #1b1b1b);
}

.retry-button:focus-visible,
.loading-details summary:focus-visible {
  outline: 2px solid var(--ytmd-accent, #ff7272);
  outline-offset: 4px;
}

.retry-button .material-symbols-outlined {
  font-size: 18px;
}

.music-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 40px;
  margin-top: 24px;
}

.music-loader span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: var(--ytmd-muted, #aaaaaa);
  animation: musicloader 1.8s ease-in-out infinite;
}

.music-loader span:nth-child(2) {
  animation-delay: 180ms;
}

.music-loader span:nth-child(3) {
  animation-delay: 360ms;
}

.loading-details {
  width: 100%;
  max-width: 440px;
  margin-top: 24px;
  color: var(--ytmd-muted, #aaaaaa);
  font-size: 12px;
  line-height: 1.6;
}

.loading-details summary {
  width: fit-content;
  margin: 0 auto;
  border-radius: 3px;
  cursor: pointer;
}

.loading-details summary:hover {
  color: var(--ytmd-text, #eeeeee);
}

.loading-details p {
  margin: 12px 0 0;
  overflow-wrap: anywhere;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes musicloader {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .music-loader span {
    animation: none;
  }

  .fade-enter-active,
  .fade-leave-active,
  .retry-button {
    transition: none;
  }
}
</style>
