// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";
import { MiniPlayerState } from "~shared/types";
import { MemoryStoreSchema, StoreSchema } from "~shared/store/schema";
import MemoryStore from "../../store-ipc/memory-store";
import Store from "../../store-ipc/store";

const memoryStore = new MemoryStore<MemoryStoreSchema>();
const store = new Store<StoreSchema>();

// Only these commands reach the player, the main process checks them again
type MiniPlayerCommand = "playPause" | "next" | "previous" | "toggleLike" | "toggleDislike" | "seekTo";

contextBridge.exposeInMainWorld("ytmd", {
  store: {
    get: async (key: keyof StoreSchema) => await store.get(key),
    onDidAnyChange: (callback: (newState: StoreSchema, oldState: StoreSchema) => void) => store.onDidAnyChange(callback)
  },
  memoryStore: {
    get: async (key: keyof MemoryStoreSchema) => await memoryStore.get(key),
    onStateChanged: (callback: (newState: MemoryStoreSchema, oldState: MemoryStoreSchema) => void) => memoryStore.onStateChanged(callback)
  },
  miniPlayer: {
    onState: (callback: (state: MiniPlayerState) => void) => ipcRenderer.on("miniPlayer:state", (_event, state: MiniPlayerState) => callback(state)),
    requestState: () => ipcRenderer.send("miniPlayer:requestState"),
    command: (command: MiniPlayerCommand, value?: number) => ipcRenderer.send("miniPlayer:command", command, value),
    setAlwaysOnTop: (alwaysOnTop: boolean) => ipcRenderer.send("miniPlayer:setAlwaysOnTop", alwaysOnTop),
    showMainWindow: () => ipcRenderer.send("miniPlayer:showMainWindow"),
    close: () => ipcRenderer.send("miniPlayer:close")
  }
});
