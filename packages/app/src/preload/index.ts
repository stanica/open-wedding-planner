import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getGatewayPort: (): Promise<number> => ipcRenderer.invoke("get-gateway-port"),
});
