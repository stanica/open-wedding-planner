import { contextBridge, ipcRenderer, shell } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openExternal: (url: string): Promise<void> => shell.openExternal(url),
  getGatewayPort: (): Promise<number> => ipcRenderer.invoke("get-gateway-port"),
  onGatewayLog: (
    callback: (log: { level: "stdout" | "stderr"; line: string; timestamp: number }) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, log: { level: string; line: string; timestamp: number }) =>
      callback(log as { level: "stdout" | "stderr"; line: string; timestamp: number });
    ipcRenderer.on("gateway-log", handler);
    return () => ipcRenderer.removeListener("gateway-log", handler);
  },
  getGatewayLogBuffer: (): Promise<
    Array<{ level: "stdout" | "stderr"; line: string; timestamp: number }>
  > => ipcRenderer.invoke("get-gateway-log-buffer"),
  showOpenDialog: (options: { filters?: Array<{ name: string; extensions: string[] }>; properties?: string[] }) =>
    ipcRenderer.invoke("dialog:showOpenDialog", options),
});
