import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export function getDataDir(): string {
  const dir = path.join(os.homedir(), ".wedding-planner");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return path.join(getDataDir(), "data.db");
}

export function getWorkspaceDir(): string {
  const dir = path.join(getDataDir(), "workspace");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDeliveryQueueDir(): string {
  const dir = path.join(getDataDir(), "delivery-queue");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getImagesDir(): string {
  const dir = path.join(getDataDir(), "images");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getWebDistDir(): string {
  // When running inside Electron (packaged), web-dist is in resourcesPath.
  // When running as a standalone Node process (dev), it's relative to this file.
  if (process.env.WEB_DIST_PATH) {
    return process.env.WEB_DIST_PATH;
  }
  // __dirname is packages/gateway/dist in dev/build
  return path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "../web-dist",
  );
}
