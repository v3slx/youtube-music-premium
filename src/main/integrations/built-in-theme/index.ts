import { BrowserView, ipcMain } from "electron";
import { ThemePreset, ThemePalette } from "../../../shared/store/schema";

// YouTube Music paints its background in several layers (html/body canvas, a header gradient that is tiled
// every ~340px, the fixed top bar and the player bar). All layers are driven by the --ytmusic-* variables
// defined on <html>, so the theme overrides those variables instead of individual containers, otherwise the
// default near-black background shows through as stripes.
function buildThemeCss(palette: Omit<ThemePalette, "accent">): string {
  return `
    html, :root {
      --ytmusic-background: ${palette.background} !important;
      --ytmusic-general-background-a: ${palette.surface} !important;
      --ytmusic-general-background-c: ${palette.background} !important;
      --ytmusic-color-black1: ${palette.raised} !important;
      --ytmusic-color-black2: ${palette.surface} !important;
      --ytmusic-color-black3: ${palette.highlight} !important;
      --ytmusic-color-black4: ${palette.background} !important;
      --ytmusic-color-white1: ${palette.text} !important;
      --ytmusic-brand-background-solid: ${palette.raised} !important;
      --ytmusic-static-brand-black: ${palette.raised} !important;
      --ytmusic-player-bar-background: ${palette.surface} !important;
      --ytmusic-player-page-background: ${palette.background} !important;
      --ytmusic-search-background: ${palette.raised} !important;
      --ytmusic-horizontal-action-card-background: ${palette.background} !important;
    }
    html, body { background-color: ${palette.background} !important; }
    #nav-bar-background { background-color: ${palette.background} !important; }
    #player-bar-background, ytmusic-player-bar { background-color: ${palette.surface} !important; }
    /* The header gradient is sized to the header image and would otherwise repeat down the page */
    .background-gradient { background-repeat: no-repeat !important; }
  `;
}

// The dynamic theme changes with every song: fade instead of jumping
const dynamicTransitionCss = `
  html, body, ytmusic-app-layout, ytmusic-nav-bar, #nav-bar-background, #guide-wrapper, #player-bar-background, ytmusic-player-bar,
  ytmusic-player-page, #player-page {
    transition: background-color 700ms ease, color 700ms ease !important;
  }
`;

const themes: Record<ThemePreset, string> = {
  [ThemePreset.Default]: "",
  [ThemePreset.Midnight]: buildThemeCss({ background: "#110f1b", surface: "#1b1728", raised: "#262036", highlight: "#30283f", text: "#f6f1ff" }),
  [ThemePreset.Ocean]: buildThemeCss({ background: "#071921", surface: "#0c2430", raised: "#12303e", highlight: "#1a4152", text: "#e4f7ff" }),
  [ThemePreset.Forest]: buildThemeCss({ background: "#0f1a12", surface: "#17261a", raised: "#1f3323", highlight: "#2a432e", text: "#eff9eb" }),
  // Built from the album art at runtime, see setDynamicPalette
  [ThemePreset.Dynamic]: ""
};

export default class BuiltInTheme {
  private ytmView: BrowserView | null = null;
  private cssKey: string | null = null;
  private selectedTheme = ThemePreset.Default;
  private dynamicPalette: ThemePalette | null = null;
  private updateVersion = 0;
  private loadedListener: ((event: Electron.IpcMainEvent) => void) | null = null;

  public provide(ytmView: BrowserView | null): void {
    if (ytmView === this.ytmView) return;

    if (this.loadedListener) ipcMain.removeListener("ytmView:loaded", this.loadedListener);

    this.ytmView = ytmView;
    this.cssKey = null;
    this.loadedListener = event => {
      if (event.sender === this.ytmView?.webContents) void this.applyTheme();
    };
    ipcMain.on("ytmView:loaded", this.loadedListener);
  }

  public setTheme(theme: ThemePreset): void {
    this.selectedTheme = theme;
    void this.applyTheme();
  }

  public setDynamicPalette(palette: ThemePalette | null): void {
    this.dynamicPalette = palette;
    if (this.selectedTheme === ThemePreset.Dynamic) void this.applyTheme();
  }

  private cssFor(theme: ThemePreset): string {
    if (theme === ThemePreset.Dynamic) return this.dynamicPalette ? buildThemeCss(this.dynamicPalette) + dynamicTransitionCss : "";
    return themes[theme] ?? "";
  }

  private async applyTheme(): Promise<void> {
    const view = this.ytmView;
    if (!view || view.webContents.isDestroyed()) return;

    const updateVersion = ++this.updateVersion;
    const css = this.cssFor(this.selectedTheme);

    // The new CSS goes in before the old comes out, otherwise the default colours flash up in between
    const cssKey = css ? await view.webContents.insertCSS(css).catch((): null => null) : null;
    if (updateVersion !== this.updateVersion || view !== this.ytmView) {
      // A newer change is on its way and replaces the current CSS itself
      if (cssKey) await view.webContents.removeInsertedCSS(cssKey).catch(() => {});
      return;
    }

    const staleKey = this.cssKey;
    this.cssKey = cssKey;
    // The key is invalid after YTM navigated/reloaded, the inserted CSS is already gone in that case
    if (staleKey) await view.webContents.removeInsertedCSS(staleKey).catch(() => {});
  }
}
