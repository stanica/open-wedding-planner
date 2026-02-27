import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { GogManager } from "../../src/infra/gog-manager.js";

describe("GogManager", () => {
  let tmpDir: string;
  let manager: GogManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gog-test-"));
    manager = new GogManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns correct asset name for darwin arm64", () => {
    const asset = manager.getAssetName("darwin", "arm64");
    expect(asset).toBe(
      `gogcli_${GogManager.GOG_VERSION}_darwin_arm64.tar.gz`,
    );
  });

  it("returns correct asset name for linux x64", () => {
    const asset = manager.getAssetName("linux", "x64");
    expect(asset).toBe(
      `gogcli_${GogManager.GOG_VERSION}_linux_amd64.tar.gz`,
    );
  });

  it("returns correct asset name for win32 x64", () => {
    const asset = manager.getAssetName("win32", "x64");
    expect(asset).toBe(
      `gogcli_${GogManager.GOG_VERSION}_windows_amd64.zip`,
    );
  });

  it("reports not installed when binary missing", () => {
    expect(manager.isInstalled()).toBe(false);
  });

  it("reports installed after binary exists with correct version", () => {
    const binName = process.platform === "win32" ? "gog.exe" : "gog";
    fs.writeFileSync(path.join(tmpDir, binName), "fake-binary");
    fs.writeFileSync(path.join(tmpDir, ".version"), GogManager.GOG_VERSION);
    expect(manager.isInstalled()).toBe(true);
  });

  it("reports not installed with wrong version", () => {
    const binName = process.platform === "win32" ? "gog.exe" : "gog";
    fs.writeFileSync(path.join(tmpDir, binName), "fake-binary");
    fs.writeFileSync(path.join(tmpDir, ".version"), "0.0.0");
    expect(manager.isInstalled()).toBe(false);
  });

  it("getBinPath returns correct path", () => {
    const binName = process.platform === "win32" ? "gog.exe" : "gog";
    expect(manager.getBinPath()).toBe(path.join(tmpDir, binName));
  });
});
