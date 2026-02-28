import path from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  dialog,
  shell,
} from "electron";
import {
  spawnGateway,
  stopGateway,
  getLogBuffer,
  setDebugWindow,
} from "./gateway-manager";
import { createTray, destroyTray } from "./tray";

let mainWindow: BrowserWindow | null = null;
let gatewayPort: number;
let isQuitting = false;
let debugWindow: BrowserWindow | null = null;

function toggleDebugWindow() {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.close();
    debugWindow = null;
    setDebugWindow(null);
    return;
  }

  debugWindow = new BrowserWindow({
    width: 900,
    height: 500,
    title: "Debug Console",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  setDebugWindow(debugWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    debugWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/debug`);
  } else {
    debugWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "debug",
    });
  }

  debugWindow.on("closed", () => {
    debugWindow = null;
    setDebugWindow(null);
  });
}

app.whenReady().then(async () => {
  // In production, use the bundled headless shell; in dev, let playwright-core
  // find browsers from the system cache
  const browserExe = app.isPackaged
    ? path.join(
        process.resourcesPath,
        "browsers",
        process.platform === "win32"
          ? "chrome-headless-shell.exe"
          : "chrome-headless-shell",
      )
    : undefined;
  gatewayPort = await spawnGateway({ browserExe });

  ipcMain.handle("get-gateway-port", () => gatewayPort);
  ipcMain.handle(
    "get-local-server-url",
    () => `http://localhost:${gatewayPort}`,
  );
  ipcMain.handle("get-gateway-log-buffer", () => getLogBuffer());
  ipcMain.handle("shell:openExternal", (_event, url: string) =>
    shell.openExternal(url),
  );
  ipcMain.handle("dialog:showOpenDialog", async (_, options) => {
    return dialog.showOpenDialog(options);
  });

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

  globalShortcut.register("CommandOrControl+Shift+D", toggleDebugWindow);
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
  globalShortcut.unregisterAll();
  destroyTray();
  await stopGateway();
});

app.on("window-all-closed", () => {
  // On macOS, don't quit when all windows closed (tray keeps running)
  if (process.platform !== "darwin") {
    app.quit();
  }
});
