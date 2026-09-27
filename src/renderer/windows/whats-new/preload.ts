// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";
import { MemoryStoreSchema, StoreSchema } from "~shared/store/schema";
import MemoryStore from "../../store-ipc/memory-store";
import Store from "../../store-ipc/store";

const memoryStore = new MemoryStore<MemoryStoreSchema>();
const store = new Store<StoreSchema>();

contextBridge.exposeInMainWorld("ytmd", {
  store: {
    get: async (key: keyof StoreSchema) => await store.get(key),
    onDidAnyChange: (callback: (newState: StoreSchema, oldState: StoreSchema) => void) => store.onDidAnyChange(callback)
  },
  memoryStore: {
    get: async (key: keyof MemoryStoreSchema) => await memoryStore.get(key),
    onStateChanged: (callback: (newState: MemoryStoreSchema, oldState: MemoryStoreSchema) => void) => memoryStore.onStateChanged(callback)
  },
  getAppVersion: async (): Promise<string> => await ipcRenderer.invoke("app:getVersion"),
  closeWindow: () => ipcRenderer.send("whatsNew:close")
});
