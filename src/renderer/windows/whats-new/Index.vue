<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useTheme } from "../../composables/useTheme";
import releaseNotes from "../../../../RELEASE_NOTES.md?raw";
import logo from "~assets/icons/ytmd.png";

useTheme();

const version = ref("");
const close = () => window.ytmd.closeWindow();

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

/** Enough Markdown for release notes: headings, lists, paragraphs, bold, code. Escaped first, links become text. */
function inline(text: string) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderMarkdown(markdown: string) {
  const html: string[] = [];
  let list = false;
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) html.push("</ul>");
    list = false;
  };
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      // The top heading is the window's own title
      if (heading[1].length > 1) html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      if (!list) html.push("<ul>");
      list = true;
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (!line) {
      flushParagraph();
      closeList();
    } else if (list && /^\s{2,}\S/.test(rawLine)) {
      // A wrapped list item
      html[html.length - 1] = html[html.length - 1].replace(/<\/li>$/, ` ${inline(line)}</li>`);
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  closeList();
  return html.join("\n");
}

const notesHtml = renderMarkdown(releaseNotes);

onMounted(async () => {
  version.value = await window.ytmd.getAppVersion();
});
</script>

<template>
  <div class="whats-new">
    <header>
      <img :src="logo" alt="" width="44" height="44" draggable="false" />
      <div class="heading">
        <h1>What's new</h1>
        <p>YouTube Music Premium {{ version }}</p>
      </div>
      <button type="button" class="close" title="Close" aria-label="Close" @click="close">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </header>
    <!-- eslint-disable-next-line vue/no-v-html -- the release notes are escaped in renderMarkdown -->
    <main class="notes" v-html="notesHtml"></main>
    <footer>
      <button type="button" class="primary" @click="close">Let's go</button>
    </footer>
  </div>
</template>

<style scoped>
.whats-new {
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: var(--ytmd-text);
  background: var(--ytmd-background);
  user-select: none;
}

header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 22px 16px;
  border-bottom: 1px solid var(--ytmd-border);
  -webkit-app-region: drag;
}

.heading {
  flex: 1;
  min-width: 0;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.4px;
}

.heading p {
  margin: 2px 0 0;
  color: var(--ytmd-muted);
  font-size: 12px;
}

button {
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.close {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: var(--ytmd-muted);
  background: transparent;
}

.close:hover {
  color: var(--ytmd-text);
  background: var(--ytmd-hover);
}

.notes {
  flex: 1;
  overflow-y: auto;
  padding: 6px 26px 20px;
  font-family: "Open Sans", sans-serif;
  font-size: 13px;
  line-height: 1.65;
  user-select: text;
  scrollbar-width: thin;
  scrollbar-color: var(--ytmd-hover) transparent;
}

.notes :deep(h2) {
  margin: 20px 0 8px;
  font-family: "Work Sans", sans-serif;
  font-size: 15px;
  font-weight: 600;
}

.notes :deep(h3) {
  margin: 16px 0 6px;
  color: var(--ytmd-accent);
  font-family: "Work Sans", sans-serif;
  font-size: 13px;
  font-weight: 600;
}

.notes :deep(p) {
  margin: 8px 0;
  color: var(--ytmd-muted);
}

.notes :deep(ul) {
  margin: 6px 0;
  padding-left: 18px;
}

.notes :deep(li) {
  margin: 5px 0;
}

.notes :deep(li::marker) {
  color: var(--ytmd-accent);
}

.notes :deep(strong) {
  font-weight: 600;
}

.notes :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--ytmd-raised);
  font-size: 12px;
}

footer {
  display: flex;
  justify-content: flex-end;
  padding: 14px 22px 18px;
  border-top: 1px solid var(--ytmd-border);
}

.primary {
  min-height: 36px;
  padding: 8px 18px;
  border-radius: 8px;
  color: var(--ytmd-on-accent);
  background: var(--ytmd-accent);
  font-weight: 600;
}

.primary:hover {
  background: color-mix(in srgb, var(--ytmd-accent) 85%, white);
}

button:focus-visible {
  outline: 2px solid var(--ytmd-accent);
  outline-offset: 2px;
}
</style>
