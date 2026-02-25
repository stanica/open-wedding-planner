import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { spawnGateway, stopGateway } from "./gateway-manager";
import { createTray, destroyTray } from "./tray";

let mainWindow: BrowserWindow | null = null;
let gatewayPort: number;
let isQuitting = false;

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

  // On macOS, hide window instead of closing so gateway stays alive
  mainWindow.on("close", (e) => {
    if (process.platform === "darwin" && !isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  // Create system tray
  createTray(() => mainWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
});

app.on("activate", () => {
  // macOS: re-show window when dock icon clicked
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on("before-quit", async () => {
  isQuitting = true;
  destroyTray();
  await stopGateway();
});

app.on("window-all-closed", () => {
  // On macOS, don't quit when all windows closed (tray keeps running)
  if (process.platform !== "darwin") {
    app.quit();
  }
});
