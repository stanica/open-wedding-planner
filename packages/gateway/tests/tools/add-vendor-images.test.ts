import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { makeAddVendorImagesTool } from "../../src/tools/add-vendor-images.js";

let tmpDir: string;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-avi-test-"));
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db };
}

describe("addVendorImages tool", () => {
  let db: ReturnType<typeof setup>["db"];

  beforeEach(async () => {
    ({ db } = setup());
    await seedCategories(db);
    await db.insert(schema.vendors).values({
      categoryId: 1,
      name: "Test Venue",
      status: "researched",
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves images from base64 data", async () => {
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const tool = makeAddVendorImagesTool({
      db,
      emit: () => {},
      imagesDir: tmpDir,
    });

    const result = await tool.execute!(
      {
        vendorId: 1,
        images: [{ data: base64, mimeType: "image/png", caption: "Pool area" }],
      },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    ) as { saved: number; failed: number; images: { caption: string | null }[]; errors: string[] };

    expect(result.saved).toBe(1);
    expect(result.images[0].caption).toBe("Pool area");

    const rows = await db.select().from(schema.vendorImages).where(eq(schema.vendorImages.vendorId, 1));
    expect(rows).toHaveLength(1);
  });

  it("saves images from URLs", async () => {
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64",
    );
    const mockFetch = async () => new Response(pngBytes, {
      headers: { "content-type": "image/png" },
    });

    const tool = makeAddVendorImagesTool({
      db,
      emit: () => {},
      imagesDir: tmpDir,
      fetchFn: mockFetch,
    });

    const result = await tool.execute!(
      {
        vendorId: 1,
        images: [{ url: "https://example.com/photo.png", caption: "Entrance" }],
      },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    ) as { saved: number; images: { caption: string | null }[] };

    expect(result.saved).toBe(1);
    expect(result.images[0].caption).toBe("Entrance");

    const rows = await db.select().from(schema.vendorImages).where(eq(schema.vendorImages.vendorId, 1));
    expect(rows).toHaveLength(1);
    expect(rows[0].originalUrl).toBe("https://example.com/photo.png");
  });

  it("handles mixed successes and failures", async () => {
    const tool = makeAddVendorImagesTool({
      db,
      emit: () => {},
      imagesDir: tmpDir,
    });

    const result = await tool.execute!(
      {
        vendorId: 1,
        images: [
          { data: "not-valid-but-will-save", mimeType: "image/png", caption: "OK" },
          { caption: "Missing data and url" },
        ],
      },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    ) as { saved: number; failed: number; errors: string[] };

    expect(result.saved).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});
