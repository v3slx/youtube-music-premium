// The command palette (Ctrl+K) inside YouTube Music: playback, navigation, themes, equalizer presets and the
// app's windows, plus an overview of every keyboard shortcut.
//
// It lives in a shadow root so YouTube Music's styles can't reach it, and it is built from elements only:
// the page enforces Trusted Types, HTML strings are refused.

import { EQUALIZER_PRESETS, StoreSchema, ThemePreset } from "../../shared/store/schema";

type Command = {
  id: string;
  group: string;
  title: string;
  icon: string;
  keywords?: string;
  hint?: string;
  run: () => void | Promise<void>;
};

export type CommandPaletteActions = {
  remote: (command: string, value?: unknown) => Promise<void>;
  app: (action: string, value?: unknown) => void;
  getSettings: () => Promise<{ shortcuts: StoreSchema["shortcuts"]; playback: StoreSchema["playback"]; appearance: StoreSchema["appearance"] }>;
};

const STYLE = `
  :host { all: initial; }
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483100; display: flex; justify-content: center; align-items: flex-start;
    padding-top: 12vh; background: rgba(0, 0, 0, 0.5);
    font-family: "YouTube Sans", Roboto, "Segoe UI", sans-serif; color: var(--ytmusic-color-white1, #fff);
    animation: fade 120ms ease;
  }
  @keyframes fade { from { opacity: 0; } }
  .panel {
    display: flex; flex-direction: column; width: min(640px, 92vw); max-height: 70vh; overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px;
    background: var(--ytmusic-color-black1, #212121); box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  }
  .search { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .icon {
    font-family: "Material Symbols Outlined"; font-size: 22px; line-height: 1; font-weight: normal; font-style: normal;
    letter-spacing: normal; text-transform: none; white-space: nowrap; direction: ltr; -webkit-font-smoothing: antialiased;
    color: rgba(255, 255, 255, 0.7);
  }
  input {
    flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: inherit;
    font: inherit; font-size: 17px;
  }
  input::placeholder { color: rgba(255, 255, 255, 0.45); }
  .list { overflow-y: auto; padding: 6px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
  .group { padding: 10px 12px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.45); }
  .item {
    display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 8px; cursor: pointer; font-size: 14px;
  }
  .item.selected { background: rgba(255, 255, 255, 0.1); }
  .item .title { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .item mark { background: none; color: #fff; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
  .hint {
    flex-shrink: 0; padding: 2px 7px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 5px;
    font-size: 11px; color: rgba(255, 255, 255, 0.6); font-variant-numeric: tabular-nums;
  }
  .empty { padding: 22px; text-align: center; color: rgba(255, 255, 255, 0.55); font-size: 14px; }
  .shortcut-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 12px; font-size: 14px; }
  .shortcut-row .muted { color: rgba(255, 255, 255, 0.45); font-size: 12px; }
  .footer {
    display: flex; gap: 16px; padding: 9px 16px; border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 11.5px; color: rgba(255, 255, 255, 0.45);
  }
  @media (prefers-reduced-motion: reduce) { .backdrop { animation: none; } }
`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "CommandOrControl+Shift+P" -> "Ctrl+Shift+P" */
function prettyAccelerator(accelerator: string) {
  return accelerator.replace(/CommandOrControl|CmdOrCtrl|Control/g, "Ctrl").replace(/Command|Cmd/g, "Cmd");
}

/** Every character of the query in order; earlier and word-start matches rank higher. */
function score(text: string, query: string): { score: number; positions: number[] } | null {
  if (!query) return { score: 0, positions: [] };
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const direct = haystack.indexOf(needle);
  if (direct !== -1) {
    const wordStart = direct === 0 || /[\s:/-]/.test(haystack[direct - 1]);
    return { score: 1000 - direct + (wordStart ? 200 : 0), positions: [...needle].map((_, index) => direct + index) };
  }
  const positions: number[] = [];
  let from = 0;
  for (const character of needle) {
    if (character === " ") continue;
    const found = haystack.indexOf(character, from);
    if (found === -1) return null;
    positions.push(found);
    from = found + 1;
  }
  return { score: 500 - (positions[positions.length - 1] - positions[0]), positions };
}

export function setupCommandPalette(actions: CommandPaletteActions) {
  const host = element("div");
  host.id = "ytmd-command-palette";
  const root = host.attachShadow({ mode: "open" });
  const style = element("style");
  style.textContent = STYLE;
  const backdrop = element("div", "backdrop");
  const panel = element("div", "panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Command palette");
  const search = element("div", "search");
  const input = element("input");
  input.placeholder = "Type a command…";
  input.setAttribute("aria-label", "Search commands");
  input.setAttribute("autocomplete", "off");
  input.spellcheck = false;
  search.append(element("span", "icon", "search"), input);
  const list = element("div", "list");
  list.setAttribute("role", "listbox");
  const footer = element("div", "footer");
  footer.append(element("span", undefined, "↑ ↓ to choose"), element("span", undefined, "Enter to run"), element("span", undefined, "Esc to close"));
  panel.append(search, list, footer);
  backdrop.append(panel);
  root.append(style, backdrop);

  let open = false;
  let commands: Command[] = [];
  let visible: Command[] = [];
  let selected = 0;
  let showingShortcuts = false;
  let lastSettings: Awaited<ReturnType<CommandPaletteActions["getSettings"]>> | null = null;

  const navigate = (browseId: string) => actions.remote("navigate", { browseEndpoint: { browseId } });

  function buildCommands(settings: typeof lastSettings) {
    const shortcuts = settings?.shortcuts;
    const hint = (value?: string) => (value ? prettyAccelerator(value) : undefined);
    const themeNames: [ThemePreset, string][] = [
      [ThemePreset.Default, "Standard"],
      [ThemePreset.Midnight, "Midnight"],
      [ThemePreset.Ocean, "Ocean"],
      [ThemePreset.Forest, "Forest"],
      [ThemePreset.Dynamic, "Dynamic (from the album art)"]
    ];
    const list: Command[] = [
      {
        id: "playPause",
        group: "Playback",
        title: "Play / Pause",
        icon: "play_pause",
        hint: hint(shortcuts?.playPause),
        run: () => actions.remote("playPause")
      },
      { id: "next", group: "Playback", title: "Next song", icon: "skip_next", hint: hint(shortcuts?.next), run: () => actions.remote("next") },
      {
        id: "previous",
        group: "Playback",
        title: "Previous song",
        icon: "skip_previous",
        hint: hint(shortcuts?.previous),
        run: () => actions.remote("previous")
      },
      {
        id: "like",
        group: "Playback",
        title: "Like",
        keywords: "thumbs up",
        icon: "thumb_up",
        hint: hint(shortcuts?.thumbsUp),
        run: () => actions.remote("toggleLike")
      },
      {
        id: "dislike",
        group: "Playback",
        title: "Dislike",
        keywords: "thumbs down",
        icon: "thumb_down",
        hint: hint(shortcuts?.thumbsDown),
        run: () => actions.remote("toggleDislike")
      },
      { id: "shuffle", group: "Playback", title: "Shuffle the queue", icon: "shuffle", run: () => actions.remote("shuffle") },
      { id: "mute", group: "Playback", title: "Mute / Unmute", keywords: "sound volume", icon: "volume_off", run: () => actions.remote("toggleMute") },
      { id: "volumeUp", group: "Playback", title: "Volume up", icon: "volume_up", hint: hint(shortcuts?.volumeUp), run: () => actions.remote("volumeUp") },
      {
        id: "volumeDown",
        group: "Playback",
        title: "Volume down",
        icon: "volume_down",
        hint: hint(shortcuts?.volumeDown),
        run: () => actions.remote("volumeDown")
      },
      { id: "copyLink", group: "Playback", title: "Copy song link", keywords: "share url", icon: "link", run: () => actions.app("copyLink") },

      {
        id: "lyrics",
        group: "View",
        title: "Fullscreen lyrics",
        keywords: "karaoke text",
        icon: "lyrics",
        hint: hint(shortcuts?.lyricsFullscreen),
        run: () => actions.remote("toggleLyricsFullscreen")
      },
      {
        id: "miniPlayer",
        group: "View",
        title: "Mini player",
        keywords: "small window picture",
        icon: "picture_in_picture_alt",
        hint: hint(shortcuts?.miniPlayer),
        run: () => actions.app("miniPlayer")
      },
      { id: "settings", group: "View", title: "Settings", keywords: "preferences options", icon: "settings", run: () => actions.app("settings") },
      {
        id: "whatsNew",
        group: "View",
        title: "What's new",
        keywords: "release notes changelog update",
        icon: "auto_awesome",
        run: () => actions.app("whatsNew")
      },

      { id: "home", group: "Go to", title: "Home", icon: "home", run: () => navigate("FEmusic_home") },
      { id: "explore", group: "Go to", title: "Explore", icon: "explore", run: () => navigate("FEmusic_explore") },
      { id: "library", group: "Go to", title: "Library", icon: "library_music", run: () => navigate("FEmusic_library_landing") },
      { id: "back", group: "Go to", title: "Back", icon: "arrow_back", run: () => history.back() },
      { id: "forward", group: "Go to", title: "Forward", icon: "arrow_forward", run: () => history.forward() },

      ...themeNames.map(([theme, name]) => ({
        id: `theme-${theme}`,
        group: "Theme",
        title: `Theme: ${name}`,
        keywords: "colour color appearance",
        icon: settings?.appearance.theme === theme ? "radio_button_checked" : "palette",
        run: () => actions.app("theme", theme)
      })),

      {
        id: "eq-off",
        group: "Sound",
        title: "Equalizer: Off",
        keywords: "eq",
        icon: settings?.playback.equalizerEnabled ? "equalizer" : "radio_button_checked",
        run: () => actions.app("equalizer", "off")
      },
      ...Object.entries(EQUALIZER_PRESETS).map(([id, preset]) => ({
        id: `eq-${id}`,
        group: "Sound",
        title: `Equalizer: ${preset.name}`,
        keywords: "eq preset",
        icon: settings?.playback.equalizerEnabled && settings.playback.equalizerPreset === id ? "radio_button_checked" : "equalizer",
        run: () => actions.app("equalizer", id)
      })),
      {
        id: "leveling",
        group: "Sound",
        title: settings?.playback.volumeLeveling ? "Volume leveling: turn off" : "Volume leveling: turn on",
        keywords: "normalize loudness",
        icon: "tune",
        run: () => actions.app("volumeLeveling")
      },

      {
        id: "shortcuts",
        group: "Help",
        title: "Keyboard shortcuts",
        keywords: "keys hotkeys keybinds",
        icon: "keyboard",
        hint: "?",
        run: () => showShortcuts()
      }
    ];
    return list;
  }

  function highlighted(title: string, positions: number[]) {
    const container = element("span", "title");
    const marks = new Set(positions);
    let buffer = "";
    let inMark = false;
    const flush = () => {
      if (!buffer) return;
      container.append(inMark ? element("mark", undefined, buffer) : document.createTextNode(buffer));
      buffer = "";
    };
    [...title].forEach((character, index) => {
      const mark = marks.has(index);
      if (mark !== inMark) {
        flush();
        inMark = mark;
      }
      buffer += character;
    });
    flush();
    return container;
  }

  function render() {
    list.replaceChildren();
    if (showingShortcuts) {
      renderShortcuts();
      return;
    }
    const query = input.value.trim();
    const matches = commands
      .map((command, index) => {
        const titleScore = score(command.title, query);
        const keywordScore = command.keywords ? score(command.keywords, query) : null;
        const best = titleScore ?? (keywordScore ? { score: keywordScore.score - 300, positions: [] } : null);
        return best ? { command, index, ...best } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (query ? b.score - a.score : a.index - b.index));
    visible = matches.map(match => match.command);
    if (selected >= visible.length) selected = Math.max(0, visible.length - 1);

    if (!visible.length) {
      list.append(element("div", "empty", "No matching command"));
      return;
    }
    let group = "";
    matches.forEach((match, index) => {
      // Groups only while browsing; a search is one ranked list
      if (!query && match.command.group !== group) {
        group = match.command.group;
        list.append(element("div", "group", group));
      }
      const item = element("div", `item${index === selected ? " selected" : ""}`);
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(index === selected));
      item.append(element("span", "icon", match.command.icon), highlighted(match.command.title, match.positions));
      if (match.command.hint) item.append(element("span", "hint", match.command.hint));
      item.addEventListener("mousemove", () => {
        if (selected === index) return;
        selected = index;
        render();
      });
      item.addEventListener("click", () => runSelected(index));
      list.append(item);
    });
    list.querySelector(".item.selected")?.scrollIntoView({ block: "nearest" });
  }

  function renderShortcuts() {
    const shortcuts = lastSettings?.shortcuts;
    const rows: [string, string | undefined][] = [
      ["Command palette", "Ctrl+K"],
      ["Close the palette or fullscreen lyrics", "Esc"],
      ["Play / Pause (global)", shortcuts?.playPause],
      ["Next song (global)", shortcuts?.next],
      ["Previous song (global)", shortcuts?.previous],
      ["Like (global)", shortcuts?.thumbsUp],
      ["Dislike (global)", shortcuts?.thumbsDown],
      ["Volume up (global)", shortcuts?.volumeUp],
      ["Volume down (global)", shortcuts?.volumeDown],
      ["Mini player (global)", shortcuts?.miniPlayer],
      ["Fullscreen lyrics (global)", shortcuts?.lyricsFullscreen],
      ["Mini player: play / pause", "Space"],
      ["Mini player: 10 seconds back / forward", "← →"]
    ];
    list.append(element("div", "group", "Keyboard shortcuts"));
    for (const [label, keys] of rows) {
      const row = element("div", "shortcut-row");
      row.append(element("span", undefined, label));
      row.append(keys ? element("span", "hint", prettyAccelerator(keys)) : element("span", "muted", "Not set - Settings → Shortcuts"));
      list.append(row);
    }
  }

  function showShortcuts() {
    showingShortcuts = true;
    input.value = "";
    input.placeholder = "Keyboard shortcuts - press Esc to go back";
    render();
    input.focus();
  }

  async function runSelected(index = selected) {
    const command = visible[index];
    if (!command) return;
    if (command.id !== "shortcuts") close();
    await command.run();
  }

  async function openPalette() {
    if (open) return;
    open = true;
    showingShortcuts = false;
    input.value = "";
    input.placeholder = "Type a command…";
    selected = 0;
    lastSettings = await actions.getSettings().catch((): null => null);
    commands = buildCommands(lastSettings);
    if (!host.isConnected) document.body.append(host);
    render();
    input.focus();
  }

  function close() {
    if (!open) return;
    open = false;
    host.remove();
  }

  input.addEventListener("input", () => {
    selected = 0;
    render();
  });

  // Keys typed here must not reach YouTube Music's own shortcuts (space would pause the music)
  for (const type of ["keydown", "keyup", "keypress"]) {
    host.addEventListener(type, event => event.stopPropagation());
  }

  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault();
      selected = Math.min(visible.length - 1, selected + 1);
      render();
    } else if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
      event.preventDefault();
      selected = Math.max(0, selected - 1);
      render();
    } else if (event.key === "Enter") {
      event.preventDefault();
      void runSelected();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (showingShortcuts) {
        showingShortcuts = false;
        input.placeholder = "Type a command…";
        render();
      } else {
        close();
      }
    } else if (event.key === "?" && !input.value) {
      event.preventDefault();
      showShortcuts();
    }
  });

  backdrop.addEventListener("mousedown", event => {
    if (event.target === backdrop) close();
  });

  window.addEventListener(
    "keydown",
    event => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        if (open) close();
        else void openPalette();
      }
    },
    true
  );

  return { open: openPalette, close };
}
