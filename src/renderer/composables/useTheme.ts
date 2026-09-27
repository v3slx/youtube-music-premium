import { ThemePreset } from "~shared/store/schema";
import type { StoreSchema } from "~shared/store/schema";

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
    [ThemePreset.Forest]: "forest"
  };
  const apply = (theme: ThemePreset) => {
    document.documentElement.dataset.theme = themes[theme] ?? "standard";
  };
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
