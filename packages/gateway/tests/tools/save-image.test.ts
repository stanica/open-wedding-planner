import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { saveImageFromUrl, saveImageFromBase64 } from "../../src/tools/save-image.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-images-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("saveImageFromUrl", () => {
  it("downloads an image and saves to disk", async () => {
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64",
    );
    const mockFetch = async () => new Response(pngBytes, {
      headers: { "content-type": "image/png" },
    });

    const result = await saveImageFromUrl(
      "https://example.com/photo.png",
      1,
      tmpDir,
      mockFetch,
    );

    expect(result.filename).toMatch(/\.png$/);
    expect(fs.existsSync(path.join(tmpDir, "1", result.filename))).toBe(true);
  });

  it("rejects non-image content types", async () => {
    const mockFetch = async () => new Response("<html>", {
      headers: { "content-type": "text/html" },
    });

    await expect(
      saveImageFromUrl("https://example.com/page", 1, tmpDir, mockFetch),
    ).rejects.toThrow("Not an image");
  });
});

describe("saveImageFromBase64", () => {
  it("decodes base64 and saves to disk", async () => {
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

    const result = await saveImageFromBase64(base64, "image/png", 1, tmpDir);

    expect(result.filename).toMatch(/\.png$/);
    expect(fs.existsSync(path.join(tmpDir, "1", result.filename))).toBe(true);
  });

  it("maps mime types to correct extensions", async () => {
    const base64 = "/9j/4AAQSkZJRg==";
    const result = await saveImageFromBase64(base64, "image/jpeg", 2, tmpDir);
    expect(result.filename).toMatch(/\.jpg$/);
  });
});
