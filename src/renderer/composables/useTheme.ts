import { ThemePreset } from "~shared/store/schema";
import type { StoreSchema, ThemePalette } from "~shared/store/schema";

let initialized = false;

// One subscription per renderer window; the shared title bar lives for the window's lifetime.
export function useTheme() {
  if (initialized || !window.ytmd.store) return;
  initialized = true;
  let revision = 0;
  const themes: Record<ThemePreset, string> = {
    [ThemePreset.Default]: "standard",
    [ThemePreset.Midnight]: "midnight",
    [ThemePreset.Ocean]: "ocean",
    [ThemePreset.Forest]: "forest",
    [ThemePreset.Dynamic]: "dynamic"
  };
  let currentTheme: ThemePreset = ThemePreset.Default;
  let palette: ThemePalette | null = null;

  // The dynamic theme's colours come from the album art and are set directly on the root element
  const applyPalette = () => {
    const style = document.documentElement.style;
    const variables: [string, keyof ThemePalette][] = [
      ["--ytmd-background", "background"],
      ["--ytmd-surface", "surface"],
      ["--ytmd-raised", "raised"],
      ["--ytmd-hover", "highlight"],
      ["--ytmd-text", "text"],
      ["--ytmd-accent", "accent"],
      ["--ytmd-on-accent", "background"]
    ];
    for (const [variable, key] of variables) {
      if (currentTheme === ThemePreset.Dynamic && palette) style.setProperty(variable, palette[key]);
      else style.removeProperty(variable);
    }
  };

  const apply = (theme: ThemePreset) => {
    currentTheme = theme;
    document.documentElement.dataset.theme = themes[theme] ?? "standard";
    applyPalette();
  };

  const memoryStore = window.ytmd.memoryStore;
  if (memoryStore) {
    void memoryStore.get("dynamicPalette").then((value: ThemePalette | null) => {
      palette = value ?? null;
      applyPalette();
    });
    memoryStore.onStateChanged(state => {
      if (state.dynamicPalette === palette) return;
      palette = state.dynamicPalette ?? null;
      applyPalette();
    });
  }
  const refresh = async () => {
    const request = ++revision;
    try {
      const appearance: StoreSchema["appearance"] = await window.ytmd.store.get("appearance");
      if (request === revision) apply(appearance.theme);
    } catch {
      // Keep the current palette if the window is closing or the store is unavailable.
    }
  };

  window.ytmd.store.onDidAnyChange(state => {
    revision++;
    apply(state.appearance.theme);
  });
  void refresh();
}
