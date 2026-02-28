import path from "node:path";
import { Tray, Menu, app, nativeImage, BrowserWindow } from "electron";

let tray: Tray | null = null;

export function createTray(getWindow: () => BrowserWindow | null): Tray {
  // Use a template image for macOS menu bar (16x16)
  const iconPath = path.join(__dirname, "../../resources/trayTemplate.png");
  let image: Electron.NativeImage;

  try {
    image = nativeImage.createFromPath(iconPath);
    image.setTemplateImage(true);
  } catch {
    // Fallback: create a simple 16x16 dot image
    image = nativeImage.createEmpty();
  }

  tray = new Tray(image);
  tray.setToolTip("Open Wedding Planner");

  function updateMenu(connected: boolean) {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open Wedding Planner",
        enabled: false,
      },
      { type: "separator" },
      {
        label: connected ? "Gateway: Connected" : "Gateway: Disconnected",
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Show Window",
        click: () => {
          const win = getWindow();
          if (win) {
            win.show();
            win.focus();
          }
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(contextMenu);
  }

  updateMenu(false);

  tray.on("click", () => {
    const win = getWindow();
    if (win) {
      if (win.isVisible()) {
        win.focus();
      } else {
        win.show();
      }
    }
  });

  return tray;
}

export function updateTrayStatus(connected: boolean): void {
  if (!tray) return;
  tray.setToolTip(
    connected ? "Open Wedding Planner - Gateway Connected" : "Open Wedding Planner - Disconnected",
  );
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
