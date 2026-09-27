<script setup lang="ts">
import { EQUALIZER_FREQUENCIES } from "~shared/store/schema";

const props = defineProps<{ modelValue: number[]; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [bands: number[]]; "change": [] }>();

const labels = EQUALIZER_FREQUENCIES.map(frequency => (frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`));

function formatGain(gain: number) {
  return `${gain > 0 ? "+" : ""}${gain} dB`;
}

function setBand(index: number, event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  const bands = [...props.modelValue];
  bands[index] = value;
  emit("update:modelValue", bands);
}

function reset() {
  emit(
    "update:modelValue",
    EQUALIZER_FREQUENCIES.map(() => 0)
  );
  emit("change");
}
</script>

<template>
  <div class="equalizer" :class="{ disabled }">
    <div class="bands" role="group" aria-label="Equalizer bands">
      <div v-for="(label, index) in labels" :key="label" class="band">
        <output class="gain" :for="`eq-band-${index}`">{{ formatGain(modelValue[index] ?? 0) }}</output>
        <input
          :id="`eq-band-${index}`"
          type="range"
          min="-12"
          max="12"
          step="1"
          :value="modelValue[index] ?? 0"
          :disabled="disabled"
          :aria-label="`${label} Hz`"
          :aria-valuetext="formatGain(modelValue[index] ?? 0)"
          @input="setBand(index, $event)"
          @change="emit('change')"
        />
        <span class="frequency">{{ label }}</span>
      </div>
    </div>
    <div class="scale" aria-hidden="true">
      <span>+12 dB</span>
      <span>0</span>
      <span>−12 dB</span>
    </div>
    <button type="button" class="reset" :disabled="disabled" @click="reset">
      <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
      Reset to flat
    </button>
  </div>
</template>

<style scoped>
.equalizer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  gap: 8px 12px;
  width: 100%;
  padding: 14px 14px 12px;
  box-sizing: border-box;
  border: 1px solid var(--ytmd-border);
  border-radius: 10px;
  background: var(--ytmd-surface);
}

.equalizer.disabled {
  opacity: 0.55;
}

.bands {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 4px;
}

.band {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.gain {
  min-height: 16px;
  color: var(--ytmd-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 150ms ease;
}

.band:hover .gain,
.band:focus-within .gain {
  opacity: 1;
}

input[type="range"] {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 22px;
  height: 128px;
  margin: 0;
  accent-color: var(--ytmd-accent);
  cursor: pointer;
}

input[type="range"]:disabled {
  cursor: not-allowed;
}

.frequency {
  color: var(--ytmd-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.scale {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 22px 0 22px;
  color: var(--ytmd-muted);
  font-size: 10px;
  text-align: right;
}

.reset {
  grid-column: 1 / -1;
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 6px 12px;
  border: 1px solid var(--ytmd-border);
  border-radius: 6px;
  color: var(--ytmd-text);
  background: var(--ytmd-raised);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 160ms ease;
}

.reset:hover:not(:disabled) {
  background: var(--ytmd-hover);
}

.reset:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.reset:focus-visible {
  outline: 2px solid var(--ytmd-accent);
  outline-offset: 2px;
}

.reset .material-symbols-outlined {
  font-size: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .gain {
    transition: none;
  }
}
</style>
