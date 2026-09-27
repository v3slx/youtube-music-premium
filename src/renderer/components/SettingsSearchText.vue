<script setup lang="ts">
import { computed } from "vue";
import { searchTerms } from "../composables/useSettingsSearch";

const props = defineProps<{ text?: string; query: string }>();
const segments = computed(() => {
  const text = props.text ?? "";
  const lower = text.toLocaleLowerCase();
  const ranges: { start: number; end: number }[] = [];
  for (const term of searchTerms(props.query)) {
    let start = lower.indexOf(term);
    while (start !== -1) {
      ranges.push({ start, end: start + term.length });
      start = lower.indexOf(term, start + term.length);
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const result: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) result.push({ text: text.slice(cursor, range.start), highlighted: false });
    result.push({ text: text.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor), highlighted: false });
  return result;
});
</script>

<template>
  <span>
    <template v-for="(segment, index) in segments" :key="index">
      <mark v-if="segment.highlighted">{{ segment.text }}</mark>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>

<style scoped>
mark {
  padding: 0;
  border-radius: 2px;
  color: var(--ytmd-text);
  background: color-mix(in srgb, var(--ytmd-accent) 28%, transparent);
  box-shadow: 0 1px 0 var(--ytmd-accent);
}
</style>
