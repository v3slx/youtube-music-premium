import { ListeningStatsSummary, MiniPlayerState, WindowsEventArguments } from "~shared/types";
import Store from "../store-ipc/store";
import { StoreSchema, MemoryStoreSchema } from "~shared/store/schema";
import MemoryStore from "../store-ipc/memory-store";

declare global {
  interface Window {
    ytmd: {
      // Settings specific
      isDarwin: boolean;
      isLinux: boolean;
      isWindows: boolean;
      store: Store<StoreSchema>;
      memoryStore: MemoryStore<MemoryStoreSchema>;
      safeStorage: {
        decryptString(value: string): string;
        encryptString(value: string): Buffer;
      };
      openSettingsWindow(): void;
      restartApplication(): void;
      restartApplicationForUpdate(): void;
      getTrueFilePath(file: File): string;
      getAudioOutputDevices(): Promise<{ deviceId: string; label: string }[]>;
      getListeningStats(): Promise<ListeningStatsSummary | null>;
      clearListeningStats(): Promise<void>;
      exportSettings(): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
      importSettings(): Promise<{ ok: boolean; canceled?: boolean; count?: number; error?: string }>;
      showWhatsNew(): void;

      // Companion Authorization specific
      sendResult(authorized: boolean);
      getAppName(): string;
      getCode(): string;

      // Main window specific
      switchFocus(context: "main" | "ytm"): void;
      toggleMiniPlayer(): void;

      // Mini player specific
      miniPlayer: {
        onState(callback: (state: MiniPlayerState) => void): void;
        requestState(): void;
        command(command: "playPause" | "next" | "previous" | "toggleLike" | "toggleDislike" | "seekTo", value?: number): void;
        setAlwaysOnTop(alwaysOnTop: boolean): void;
        showMainWindow(): void;
        close(): void;
      };

      // YTM view specific
      ytmViewNavigateDefault(): void;
      ytmViewRecreate(): void;

      // Window control
      minimizeWindow(): void;
      maximizeWindow(): void;
      restoreWindow(): void;
      closeWindow(): void;
      handleWindowEvents(callback: (event: Electron.IpcRendererEvent, args: WindowsEventArguments) => void);
      requestWindowState(): void;

      // App specific
      getAppVersion(): Promise<string>;
      checkForUpdates(): void;
      handleCheckingForUpdate(callback: (event: Electron.IpcRendererEvent) => void);
      handleUpdateAvailable(callback: (event: Electron.IpcRendererEvent) => void);
      handleUpdateNotAvailable(callback: (event: Electron.IpcRendererEvent) => void);
      handleUpdateDownloaded(callback: (event: Electron.IpcRendererEvent) => void);
      isAppUpdateAvailable(): Promise<boolean>;
      isAppUpdateDownloaded(): Promise<boolean>;
    };
  }

  // Fixes the navigator type to include windowControlsOverlay
  interface Navigator {
    windowControlsOverlay: {
      visible: boolean;
      addEventListener(event: "geometrychange", listener: (event: { visible: boolean }) => void);
    };
  }
}
