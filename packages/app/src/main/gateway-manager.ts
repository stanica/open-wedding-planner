import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { GATEWAY_READY_PREFIX } from "@wedding-planner/shared";
import type { BrowserWindow } from "electron";

let gatewayProcess: ChildProcess | null = null;

const logBuffer: Array<{ level: "stdout" | "stderr"; line: string; timestamp: number }> = [];
const MAX_LOG_BUFFER = 500;
let debugWindow: BrowserWindow | null = null;

export function setDebugWindow(win: BrowserWindow | null) {
  debugWindow = win;
}

export function getLogBuffer() {
  return logBuffer;
}

function pushLog(level: "stdout" | "stderr", line: string) {
  const entry = { level, line, timestamp: Date.now() };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_BUFFER);
  }
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.webContents.send("gateway-log", entry);
  }
}

export function spawnGateway(options?: { browserExe?: string }): Promise<number> {
  return new Promise((resolve, reject) => {
    const gatewayPath = path.join(
      __dirname,
      "../../..",
      "gateway/dist/index.js",
    );

    // Use system node instead of Electron binary so native modules
    // (better-sqlite3, etc.) work with the correct NODE_MODULE_VERSION
    const nodePath = process.env.NODE_PATH_OVERRIDE || "node";

    gatewayProcess = spawn(nodePath, [gatewayPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: undefined,
        ...(options?.browserExe ? { BROWSER_EXECUTABLE_PATH: options.browserExe } : {}),
      },
    });

    const timeout = setTimeout(() => {
      reject(new Error("Gateway startup timed out"));
    }, 10000);

    gatewayProcess.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line.startsWith(GATEWAY_READY_PREFIX)) {
        clearTimeout(timeout);
        const port = parseInt(line.slice(GATEWAY_READY_PREFIX.length), 10);
        resolve(port);
      } else {
        pushLog("stdout", line);
      }
    });

    gatewayProcess.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      console.error("[gateway]", line);
      pushLog("stderr", line);
    });

    gatewayProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    gatewayProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Gateway exited with code ${code}`));
      }
      gatewayProcess = null;
    });
  });
}

export async function stopGateway(): Promise<void> {
  if (!gatewayProcess) return;

  const proc = gatewayProcess;
  gatewayProcess = null;

  return new Promise((resolve) => {
    const killTimeout = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve();
    }, 5000);

    proc.on("exit", () => {
      clearTimeout(killTimeout);
      resolve();
    });

    proc.kill("SIGTERM");
  });
}
