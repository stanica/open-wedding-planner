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

export function getDeliveryQueueDir(): string {
  const dir = path.join(getDataDir(), "delivery-queue");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
