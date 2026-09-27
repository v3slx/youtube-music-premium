<script setup lang="ts">
import { provideSettingsSection } from "../composables/useSettingsSearch";

const props = defineProps<{ section: number; title: string; description: string }>();
provideSettingsSection(props.section);
</script>

<template>
  <section :id="`settings-section-${section}`" class="settings-section" :aria-labelledby="`settings-heading-${section}`">
    <header>
      <h2 :id="`settings-heading-${section}`">{{ title }}</h2>
      <p>{{ description }}</p>
    </header>
    <slot></slot>
  </section>
</template>

<style scoped>
header {
  padding: 0 0 18px;
  border-bottom: 1px solid var(--ytmd-border);
}

h2 {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.6px;
}

p {
  margin: 0;
  color: var(--ytmd-muted);
  font:
    12px/1.6 "Open Sans",
    sans-serif;
}
</style>
