// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";
import { WindowsEventArguments } from "~shared/types";
import { MemoryStoreSchema, StoreSchema } from "~shared/store/schema";
import MemoryStore from "../../store-ipc/memory-store";
import Store from "../../store-ipc/store";

const memoryStore = new MemoryStore<MemoryStoreSchema>();
const store = new Store<StoreSchema>();

contextBridge.exposeInMainWorld("ytmd", {
  minimizeWindow: () => ipcRenderer.send("mainWindow:minimize"),
  maximizeWindow: () => ipcRenderer.send("mainWindow:maximize"),
  restoreWindow: () => ipcRenderer.send("mainWindow:restore"),
  closeWindow: () => ipcRenderer.send("mainWindow:close"),
  handleWindowEvents: (callback: (event: Electron.IpcRendererEvent, args: WindowsEventArguments) => void) =>
    ipcRenderer.on("mainWindow:stateChanged", callback),
  requestWindowState: () => ipcRenderer.send("mainWindow:requestWindowState"),
  openSettingsWindow: () => ipcRenderer.send("settingsWindow:open"),
  switchFocus: (context: string) => ipcRenderer.send("ytmView:switchFocus", context),
  toggleMiniPlayer: () => ipcRenderer.send("miniPlayer:toggle"),
  ytmViewNavigateDefault: () => ipcRenderer.send("ytmView:navigateDefault"),
  ytmViewRecreate: () => ipcRenderer.send("ytmView:recreate"),
  store: {
    get: async (key: keyof StoreSchema) => await store.get(key),
    onDidAnyChange: (callback: (newState: StoreSchema, oldState: StoreSchema) => void) => store.onDidAnyChange(callback)
  },
  memoryStore: {
    set: (key: string, value: unknown) => memoryStore.set(key, value),
    get: async (key: keyof MemoryStoreSchema) => await memoryStore.get(key),
    onStateChanged: (callback: (newState: MemoryStoreSchema, oldState: MemoryStoreSchema) => void) => memoryStore.onStateChanged(callback)
  },
  restartApplicationForUpdate: () => ipcRenderer.send("app:restartApplicationForUpdate")
});
