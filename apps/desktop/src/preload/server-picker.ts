import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("serverPicker", {
  choose: (input: unknown) => ipcRenderer.invoke("server:choose", input),
});
