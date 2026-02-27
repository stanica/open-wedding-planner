import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { Router } from "../../src/infra/router.js";
import { registerAllHandlers } from "../../src/handlers/index.js";

let tmpDir: string;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-vi-test-"));
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerAllHandlers(router, undefined as any, undefined, undefined, tmpDir);
  return { db, router };
}

describe("vendor-images handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Test Venue",
      status: "researched",
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uploads and lists images for a vendor", async () => {
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

    await router.handle(db, "vendor-images.upload", {
      vendorId: 1,
      base64,
      mimeType: "image/png",
      caption: "Pool area",
    });

    const images = (await router.handle(db, "vendor-images.list", { vendorId: 1 })) as any[];
    expect(images).toHaveLength(1);
    expect(images[0].caption).toBe("Pool area");
    expect(images[0].filename).toMatch(/\.png$/);
  });

  it("deletes an image", async () => {
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    await router.handle(db, "vendor-images.upload", {
      vendorId: 1,
      base64,
      mimeType: "image/png",
    });

    const images = (await router.handle(db, "vendor-images.list", { vendorId: 1 })) as any[];
    await router.handle(db, "vendor-images.delete", { id: images[0].id });

    const after = (await router.handle(db, "vendor-images.list", { vendorId: 1 })) as any[];
    expect(after).toHaveLength(0);
  });

  it("reorders images", async () => {
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    await router.handle(db, "vendor-images.upload", { vendorId: 1, base64, mimeType: "image/png", caption: "A" });
    await router.handle(db, "vendor-images.upload", { vendorId: 1, base64, mimeType: "image/png", caption: "B" });

    const images = (await router.handle(db, "vendor-images.list", { vendorId: 1 })) as any[];
    await router.handle(db, "vendor-images.reorder", {
      order: [{ id: images[1].id, sortOrder: 0 }, { id: images[0].id, sortOrder: 1 }],
    });

    const reordered = (await router.handle(db, "vendor-images.list", { vendorId: 1 })) as any[];
    expect(reordered[0].caption).toBe("B");
    expect(reordered[1].caption).toBe("A");
  });
});
