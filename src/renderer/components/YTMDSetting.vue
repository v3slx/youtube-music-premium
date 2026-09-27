<script setup lang="ts" generic="T extends 'checkbox' | 'file' | 'range' | 'select' | 'custom'">
import { computed, ref, useId } from "vue";
import { useSettingSearch } from "../composables/useSettingsSearch";
import SettingsSearchText from "./SettingsSearchText.vue";

type ModelValue = {
  checkbox: boolean;
  file: string;
  range: number;
  custom: never;
  select: number | string;
};

const props = defineProps<{
  type: T;
  modelValue?: ModelValue[T];
  name: string;
  description?: string;
  restartRequired?: boolean;
  indented?: boolean;
  bindSetting?: string; // This is for the file picker so that it can properly set a data attribute that binds the setting correctly. TODO: Rewrite to not have this
  max?: number | string;
  min?: number | string;
  step?: number | string;
  disabled?: boolean;
  disabledMessage?: string;
  flexColumn?: boolean;
  beta?: boolean;
  optionsMap?: { [key: string]: string }; // This is for the select menu
}>();
const emit = defineEmits(["update:modelValue", "file-change", "change", "clear"]);
const controlId = useId();
const { matches, query } = useSettingSearch(() => ({
  name: props.name,
  description: [props.description, props.disabled ? props.disabledMessage : undefined].filter(Boolean).join(" ")
}));

const value = computed({
  get() {
    return props.modelValue;
  },
  set(value) {
    emit("update:modelValue", value);
  }
});

const hasDescription = computed(() => {
  return props.description && props.description.trim() !== "";
});

const fileInput = ref<HTMLInputElement | null>(null);
const descriptionId = computed(() => {
  const ids = [];
  if (hasDescription.value) ids.push(`${controlId}-description`);
  if (props.disabled && props.disabledMessage) ids.push(`${controlId}-disabled`);
  return ids.join(" ") || undefined;
});

function select(event: Event) {
  if (!(event.target instanceof HTMLSelectElement)) return;
  const optionKey = event.target.value;
  value.value = (typeof props.modelValue === "number" ? Number.parseInt(optionKey) : optionKey) as ModelValue[T];
  emit("change");
}
</script>

<template>
  <div v-show="matches" :class="{ 'ytmd-setting': true, 'indented': props.indented, 'flex-column': props.flexColumn, 'is-disabled': disabled }">
    <div class="setting-copy">
      <label :id="`${controlId}-label`" class="name" :for="type !== 'custom' ? controlId : undefined">
        <slot name="name">
          <span><SettingsSearchText :text="name" :query="query" /></span>
        </slot>
        <span v-if="restartRequired" class="reload-required material-symbols-outlined" title="Restart required" aria-label="Restart required">autorenew</span>
        <span v-if="beta" class="beta-tag" title="This is a beta feature and may not work correctly yet.">Beta</span>
        <span v-if="disabled" class="disabled-tag">Disabled</span>
      </label>
      <p v-if="hasDescription" :id="`${controlId}-description`" class="description">
        <SettingsSearchText :text="description ?? ''" :query="query" />
      </p>
      <p v-if="disabled && disabledMessage" :id="`${controlId}-disabled`" class="message">
        <SettingsSearchText :text="disabledMessage" :query="query" />
      </p>
    </div>

    <input
      v-if="type === 'checkbox'"
      :id="controlId"
      v-model="value"
      :disabled="disabled"
      type="checkbox"
      role="switch"
      :aria-describedby="descriptionId"
      @change="$emit('change', $event)"
    />
    <div v-if="type === 'range'" class="range-selector">
      <output :for="controlId" class="range-value">{{ value }}</output>
      <input
        :id="controlId"
        v-model.number="value"
        :disabled="disabled"
        type="range"
        :max="props.max"
        :min="props.min"
        :step="props.step"
        :aria-describedby="descriptionId"
        @change="$emit('change', $event)"
      />
    </div>
    <div v-if="type === 'file'" class="file-picker">
      <input
        ref="fileInput"
        :disabled="disabled"
        type="file"
        accept=".css"
        :data-setting="bindSetting"
        :aria-label="name"
        @change="$emit('file-change', $event)"
      />
      <div class="file-input-button">
        <button
          :id="controlId"
          type="button"
          class="choose"
          :disabled="disabled"
          :aria-label="`Choose ${name.toLowerCase()}`"
          :aria-describedby="descriptionId"
          title="Choose CSS file"
          @click="fileInput?.click()"
        >
          <span class="material-symbols-outlined" aria-hidden="true">file_open</span>
        </button>
        <input :disabled="disabled" type="text" readonly class="path" placeholder="No file chosen" :value="value" :aria-label="`${name} path`" />
        <button v-if="value" type="button" class="remove" :disabled="disabled" aria-label="Remove CSS file" title="Remove CSS file" @click="$emit('clear')">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </div>
    <div v-if="type === 'select'" class="select-wrapper">
      <select :id="controlId" :value="value" :disabled="disabled" :aria-describedby="descriptionId" @change="select">
        <option v-for="(optionValue, optionKey) of props.optionsMap" :key="optionKey" :value="optionKey">{{ optionValue }}</option>
      </select>
      <span class="select-arrow material-symbols-outlined" aria-hidden="true">expand_more</span>
    </div>

    <slot></slot>
  </div>
</template>

<style scoped>
.ytmd-setting {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-width: 0;
  min-height: 72px;
  padding: 18px 0;
  border-bottom: 1px solid var(--ytmd-border, #29292d);
  color: var(--ytmd-text, #f5f5f7);
}

.ytmd-setting:last-child {
  border-bottom: none;
}

.ytmd-setting.indented {
  margin-left: 12px;
  padding-left: 16px;
  border-left: 2px solid var(--ytmd-border, #29292d);
}

.ytmd-setting.flex-column {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 16px;
}

.setting-copy {
  flex: 1;
  min-width: 0;
}

.name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
  cursor: inherit;
}

.name[for] {
  cursor: pointer;
}

.is-disabled .name {
  color: var(--ytmd-muted, #9999a3);
  cursor: default;
}

.beta-tag,
.disabled-tag {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--ytmd-border, #29292d);
  border-radius: 4px;
  padding: 0 5px;
  background-color: var(--ytmd-raised, #202024);
  color: var(--ytmd-muted, #9999a3);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.7;
}

.description,
.message {
  margin: 4px 0 0;
  color: var(--ytmd-muted, #9999a3);
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.reload-required {
  color: var(--ytmd-muted, #9999a3);
  font-size: 17px;
}

input,
select,
button {
  font: inherit;
}

input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 2px solid var(--ytmd-accent, #ff565e);
  outline-offset: 3px;
}

input[type="checkbox"] {
  appearance: none;
  position: relative;
  flex: 0 0 42px;
  width: 42px;
  min-width: 42px;
  height: 24px;
  min-height: 24px;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ytmd-border, #29292d);
  border-radius: 20px;
  background-color: var(--ytmd-raised, #202024);
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease;
}

input[type="checkbox"]::before {
  content: "";
  display: block;
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  top: 3px;
  border-radius: 50%;
  background-color: var(--ytmd-muted, #9999a3);
  transition:
    transform 160ms ease,
    background-color 160ms ease;
}

input[type="checkbox"]:hover:not(:disabled) {
  border-color: var(--ytmd-muted, #9999a3);
}

input[type="checkbox"]:checked {
  border-color: var(--ytmd-accent, #ff565e);
  background-color: var(--ytmd-accent, #ff565e);
}

input[type="checkbox"]:checked::before {
  transform: translateX(18px);
  background-color: var(--ytmd-on-accent, #ffffff);
}

input:disabled,
button:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

input[type="file"] {
  display: none;
}

.file-picker,
.select-wrapper {
  flex: 0 1 216px;
  width: 216px;
  min-width: 160px;
}

.file-input-button {
  display: flex;
  align-items: center;
  border: 1px solid var(--ytmd-border, #29292d);
  border-radius: 7px;
  background-color: var(--ytmd-raised, #202024);
}

.file-input-button button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--ytmd-text, #f5f5f7);
  cursor: pointer;
  transition: background-color 160ms ease;
}

.file-input-button button:hover:not(:disabled) {
  background-color: var(--ytmd-hover, #303036);
}

.file-input-button .remove:hover:not(:disabled) {
  color: var(--ytmd-danger, #ff767d);
}

.file-input-button .material-symbols-outlined {
  font-size: 18px;
}

.file-input-button .path {
  min-width: 0;
  width: 100%;
  margin: 0;
  padding: 8px 4px;
  border: none;
  background-color: transparent;
  color: var(--ytmd-text, #f5f5f7);
  font-size: 12px;
  text-overflow: ellipsis;
}

.file-input-button .path::placeholder {
  color: var(--ytmd-muted, #9999a3);
}

.range-selector {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex: 0 1 216px;
  min-width: 160px;
}

.range-value {
  min-width: 34px;
  color: var(--ytmd-muted, #9999a3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

input[type="range"] {
  appearance: none;
  width: 150px;
  min-width: 80px;
  height: 5px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background-color: var(--ytmd-hover, #303036);
  cursor: pointer;
}

input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 15px;
  height: 15px;
  border: 2px solid var(--ytmd-accent, #ff565e);
  border-radius: 50%;
  background-color: var(--ytmd-accent, #ff565e);
}

.select-wrapper {
  position: relative;
}

select {
  appearance: none;
  width: 100%;
  min-height: 36px;
  padding: 7px 30px 7px 10px;
  border: 1px solid var(--ytmd-border, #29292d);
  border-radius: 7px;
  background-color: var(--ytmd-raised, #202024);
  color: var(--ytmd-text, #f5f5f7);
  font-size: 12px;
  text-overflow: ellipsis;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
}

select:hover:not(:disabled) {
  border-color: var(--ytmd-muted, #9999a3);
  background-color: var(--ytmd-hover, #303036);
}

.select-arrow {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ytmd-muted, #9999a3);
  font-size: 19px;
  pointer-events: none;
}

@media (max-width: 620px) {
  .ytmd-setting {
    gap: 16px;
  }

  .file-picker,
  .select-wrapper,
  .range-selector {
    flex-basis: 180px;
    width: 180px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before {
    transition: none !important;
  }
}
</style>
