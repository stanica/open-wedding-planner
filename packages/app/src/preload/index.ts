import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
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
});
