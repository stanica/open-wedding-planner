#!/usr/bin/env node
/**
 * Copies the Playwright chromium-headless-shell binary into packages/app/browsers/
 * so electron-builder can bundle it as an extraResource.
 *
 * Usage: node scripts/prepare-browsers.mjs
 *
 * Requires: npx playwright install chromium (run once to populate the cache)
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const appDir = path.dirname(new URL(import.meta.url).pathname).replace("/scripts", "");
const destDir = path.join(appDir, "browsers");

// Ask playwright-core where its browsers live
const browsersPath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  execSync("node -e \"process.stdout.write(require('playwright-core').chromium.executablePath())\"", {
    encoding: "utf-8",
  })
    .trim()
    // Walk up from the executable to the ms-playwright root
    .replace(/\/chromium-\d+\/.*$/, "");

// Find the latest chromium_headless_shell directory (e.g. chromium_headless_shell-1208)
const { readdirSync } = await import("node:fs");
const entries = readdirSync(browsersPath);
const shellDirs = entries
  .filter((e) => e.startsWith("chromium_headless_shell-"))
  .sort((a, b) => {
    const revA = parseInt(a.split("-").pop(), 10);
    const revB = parseInt(b.split("-").pop(), 10);
    return revB - revA; // highest revision first
  });
const shellDir = shellDirs[0];
if (!shellDir) {
  console.error(
    "chromium-headless-shell not found in",
    browsersPath,
    "\nRun: npx playwright install chromium",
  );
  process.exit(1);
}

// Find the platform subdirectory (e.g. chrome-headless-shell-mac-arm64)
const shellBase = path.join(browsersPath, shellDir);
const platformDirs = readdirSync(shellBase).filter((e) =>
  e.startsWith("chrome-headless-shell-"),
);
if (platformDirs.length === 0) {
  console.error("No platform directory found in", shellBase);
  process.exit(1);
}

const srcDir = path.join(shellBase, platformDirs[0]);

// Copy to packages/app/browsers/
if (existsSync(destDir)) {
  execSync(`rm -rf ${JSON.stringify(destDir)}`);
}
mkdirSync(destDir, { recursive: true });
cpSync(srcDir, destDir, { recursive: true });

console.log(`Copied headless shell from ${srcDir} to ${destDir}`);
