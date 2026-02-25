import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { spawnGateway, stopGateway } from "./gateway-manager";

let mainWindow: BrowserWindow | null = null;
let gatewayPort: number;

app.whenReady().then(async () => {
  gatewayPort = await spawnGateway();

  ipcMain.handle("get-gateway-port", () => gatewayPort);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
});

app.on("before-quit", async () => {
  await stopGateway();
});

app.on("window-all-closed", () => {
  app.quit();
});
