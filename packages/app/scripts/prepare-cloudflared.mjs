#!/usr/bin/env node
/**
 * Downloads the cloudflared binary for the current platform into
 * packages/app/cloudflared/ so electron-builder can bundle it.
 *
 * Usage: node scripts/prepare-cloudflared.mjs
 */
import {
  createWriteStream,
  mkdirSync,
  chmodSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { execSync } from "node:child_process";
import path from "node:path";

const appDir = path
  .dirname(new URL(import.meta.url).pathname)
  .replace("/scripts", "");
const destDir = path.join(appDir, "cloudflared");
mkdirSync(destDir, { recursive: true });

const platform = process.platform; // darwin, linux, win32
const arch = process.arch; // arm64, x64

// Asset name on GitHub releases
const ASSET_MAP = {
  darwin: {
    arm64: "cloudflared-darwin-arm64.tgz",
    x64: "cloudflared-darwin-amd64.tgz",
  },
  linux: { arm64: "cloudflared-linux-arm64", x64: "cloudflared-linux-amd64" },
  win32: {
    arm64: "cloudflared-windows-amd64.exe",
    x64: "cloudflared-windows-amd64.exe",
  },
};

const assetName = ASSET_MAP[platform]?.[arch];
if (!assetName) {
  console.error(`Unsupported platform/arch: ${platform}/${arch}`);
  process.exit(1);
}

const destName = platform === "win32" ? "cloudflared.exe" : "cloudflared";
const destPath = path.join(destDir, destName);

if (existsSync(destPath)) {
  console.log(`cloudflared already present at ${destPath}, skipping download.`);
  process.exit(0);
}

const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${assetName}`;
console.log(`Downloading ${url} ...`);

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

if (assetName.endsWith(".tgz")) {
  // macOS: download tgz then extract the binary from it
  const tgzPath = path.join(destDir, assetName);
  await download(url, tgzPath);
  execSync(`tar -xzf ${JSON.stringify(tgzPath)} -C ${JSON.stringify(destDir)}`);
  unlinkSync(tgzPath);
  // The tgz contains a single binary named "cloudflared"
  const extracted = path.join(destDir, "cloudflared");
  if (extracted !== destPath) {
    execSync(`mv ${JSON.stringify(extracted)} ${JSON.stringify(destPath)}`);
  }
} else {
  await download(url, destPath);
}

if (platform !== "win32") {
  chmodSync(destPath, 0o755);
}

console.log(`cloudflared saved to ${destPath}`);
