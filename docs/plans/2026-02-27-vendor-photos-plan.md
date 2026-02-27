# Vendor Photo Gallery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-image support for vendors with local file storage, agent integration, and a photo gallery UI with lightbox.

**Architecture:** New `vendor_images` DB table tracks images stored on disk at `~/.wedding-planner/images/{vendorId}/`. Gateway serves images via HTTP (same port as WS). Agent tool `addVendorImages` downloads images from URLs or accepts base64. Frontend adds a "Photos" tab with grid, lightbox, and drag-drop upload.

**Tech Stack:** drizzle-orm, better-sqlite3, node:fs/crypto, cheerio, React 19, framer-motion, tailwindcss v4

---

### Task 1: Database Schema — `vendor_images` Table

**Files:**
- Modify: `packages/gateway/src/db/schema.ts`
- Modify: `packages/gateway/src/db/migrate.ts`
- Test: `packages/gateway/tests/db.test.ts`

**Step 1: Write the failing test**

Add to `packages/gateway/tests/db.test.ts`:

```typescript
it("creates vendor_images table", () => {
  const rows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vendor_images'").all();
  expect(rows).toHaveLength(1);
});

it("inserts and retrieves vendor images", () => {
  // Need a vendor first (category 1 must exist)
  sqlite.exec("INSERT INTO categories (name, budget_percent_low, budget_percent_high, sort_order) VALUES ('Test', 0.1, 0.2, 1)");
  sqlite.exec("INSERT INTO vendors (category_id, name, status) VALUES (1, 'Test Vendor', 'researched')");

  sqlite.exec(`INSERT INTO vendor_images (vendor_id, filename, original_url, caption, sort_order)
    VALUES (1, 'abc123.jpg', 'https://example.com/photo.jpg', 'Pool area', 0)`);

  const rows = sqlite.prepare("SELECT * FROM vendor_images WHERE vendor_id = 1").all() as any[];
  expect(rows).toHaveLength(1);
  expect(rows[0].filename).toBe("abc123.jpg");
  expect(rows[0].caption).toBe("Pool area");
});

it("cascade-deletes vendor images when vendor is deleted", () => {
  sqlite.exec("INSERT INTO categories (name, budget_percent_low, budget_percent_high, sort_order) VALUES ('Test', 0.1, 0.2, 1)");
  sqlite.exec("INSERT INTO vendors (category_id, name, status) VALUES (1, 'Test Vendor', 'researched')");
  sqlite.exec("INSERT INTO vendor_images (vendor_id, filename, sort_order) VALUES (1, 'abc.jpg', 0)");

  sqlite.exec("DELETE FROM vendors WHERE id = 1");

  const rows = sqlite.prepare("SELECT * FROM vendor_images").all();
  expect(rows).toHaveLength(0);
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/db.test.ts`
Expected: FAIL — `vendor_images` table doesn't exist

**Step 3: Add schema definition**

In `packages/gateway/src/db/schema.ts`, add after the `vendors` table definition:

```typescript
export const vendorImages = sqliteTable("vendor_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalUrl: text("original_url"),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

In `packages/gateway/src/db/migrate.ts`, add to the `CREATE TABLE IF NOT EXISTS` block inside `pushSchema`:

```sql
CREATE TABLE IF NOT EXISTS vendor_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_url TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/db.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/db/schema.ts packages/gateway/src/db/migrate.ts packages/gateway/tests/db.test.ts
git commit -m "feat: add vendor_images table to schema and migration"
```

---

### Task 2: Image Storage Utility — `save-image.ts`

**Files:**
- Modify: `packages/gateway/src/config/paths.ts` (add `getImagesDir`)
- Create: `packages/gateway/src/tools/save-image.ts`
- Test: `packages/gateway/tests/tools/save-image.test.ts`

**Step 1: Write the failing tests**

Create `packages/gateway/tests/tools/save-image.test.ts`:

```typescript
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
    // 1x1 red PNG as a data URL won't work, use a mock fetch
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
    const base64 = "/9j/4AAQSkZJRg=="; // Tiny fake JPEG header
    const result = await saveImageFromBase64(base64, "image/jpeg", 2, tmpDir);
    expect(result.filename).toMatch(/\.jpg$/);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/gateway && npx vitest run tests/tools/save-image.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Add `getImagesDir` to paths.ts**

In `packages/gateway/src/config/paths.ts`, add:

```typescript
export function getImagesDir(): string {
  const dir = path.join(getDataDir(), "images");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
```

**Step 4: Create `save-image.ts`**

Create `packages/gateway/src/tools/save-image.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

type FetchFn = (url: string) => Promise<Response>;

export async function saveImageFromUrl(
  url: string,
  vendorId: number,
  imagesDir: string,
  fetchFn: FetchFn = fetch,
): Promise<{ filename: string }> {
  const res = await fetchFn(url);
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";

  if (!contentType.startsWith("image/")) {
    throw new Error(`Not an image: ${contentType}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_SIZE) {
    throw new Error(`Image too large: ${buffer.length} bytes`);
  }

  const ext = MIME_TO_EXT[contentType] ?? ".jpg";
  return saveBuffer(buffer, ext, vendorId, imagesDir);
}

export async function saveImageFromBase64(
  base64: string,
  mimeType: string,
  vendorId: number,
  imagesDir: string,
): Promise<{ filename: string }> {
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_SIZE) {
    throw new Error(`Image too large: ${buffer.length} bytes`);
  }

  const ext = MIME_TO_EXT[mimeType] ?? ".jpg";
  return saveBuffer(buffer, ext, vendorId, imagesDir);
}

function saveBuffer(
  buffer: Buffer,
  ext: string,
  vendorId: number,
  imagesDir: string,
): { filename: string } {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const filename = `${hash}${ext}`;
  const dir = path.join(imagesDir, String(vendorId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return { filename };
}

export function deleteImageFile(
  vendorId: number,
  filename: string,
  imagesDir: string,
): void {
  const filePath = path.join(imagesDir, String(vendorId), filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/tools/save-image.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gateway/src/config/paths.ts packages/gateway/src/tools/save-image.ts packages/gateway/tests/tools/save-image.test.ts
git commit -m "feat: add image save/delete utility with URL and base64 support"
```

---

### Task 3: Vendor Images Handler

**Files:**
- Create: `packages/gateway/src/handlers/vendor-images.ts`
- Modify: `packages/gateway/src/handlers/index.ts`
- Modify: `packages/gateway/src/handlers/vendors.ts` (cascade delete files)
- Test: `packages/gateway/tests/handlers/vendor-images.test.ts`

**Step 1: Write the failing tests**

Create `packages/gateway/tests/handlers/vendor-images.test.ts`:

```typescript
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
    // 1x1 PNG as base64
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
    // Reverse order
    await router.handle(db, "vendor-images.reorder", {
      order: [{ id: images[1].id, sortOrder: 0 }, { id: images[0].id, sortOrder: 1 }],
    });

    const reordered = (await router.handle(db, "vendor-images.list", { vendorId: 1 })) as any[];
    expect(reordered[0].caption).toBe("B");
    expect(reordered[1].caption).toBe("A");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/gateway && npx vitest run tests/handlers/vendor-images.test.ts`
Expected: FAIL — handler not registered

**Step 3: Create `vendor-images.ts` handler**

Create `packages/gateway/src/handlers/vendor-images.ts`:

```typescript
import { eq } from "drizzle-orm";
import { vendorImages } from "../db/schema.js";
import { saveImageFromBase64, deleteImageFile } from "../tools/save-image.js";
import type { Router, Db } from "../infra/router.js";

export function registerVendorImageHandlers(router: Router, imagesDir: string) {
  router.register("vendor-images.list", async (db: Db, params: unknown) => {
    const { vendorId } = params as { vendorId: number };
    return db
      .select()
      .from(vendorImages)
      .where(eq(vendorImages.vendorId, vendorId))
      .orderBy(vendorImages.sortOrder);
  });

  router.register("vendor-images.upload", async (db: Db, params: unknown) => {
    const { vendorId, base64, mimeType, caption, originalUrl } = params as {
      vendorId: number;
      base64: string;
      mimeType: string;
      caption?: string;
      originalUrl?: string;
    };

    const { filename } = await saveImageFromBase64(base64, mimeType, vendorId, imagesDir);

    // Get next sort order
    const existing = await db
      .select()
      .from(vendorImages)
      .where(eq(vendorImages.vendorId, vendorId));
    const nextOrder = existing.length;

    const [row] = await db
      .insert(vendorImages)
      .values({
        vendorId,
        filename,
        originalUrl: originalUrl ?? null,
        caption: caption ?? null,
        sortOrder: nextOrder,
      })
      .returning();

    return row;
  });

  router.register("vendor-images.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [image] = await db.select().from(vendorImages).where(eq(vendorImages.id, id));
    if (image) {
      deleteImageFile(image.vendorId, image.filename, imagesDir);
      await db.delete(vendorImages).where(eq(vendorImages.id, id));
    }
    return { ok: true };
  });

  router.register("vendor-images.reorder", async (db: Db, params: unknown) => {
    const { order } = params as { order: Array<{ id: number; sortOrder: number }> };
    for (const item of order) {
      await db
        .update(vendorImages)
        .set({ sortOrder: item.sortOrder })
        .where(eq(vendorImages.id, item.id));
    }
    return { ok: true };
  });
}
```

**Step 4: Register in `handlers/index.ts`**

Add import:
```typescript
import { registerVendorImageHandlers } from "./vendor-images.js";
```

Update `registerAllHandlers` signature to accept `imagesDir?: string`:
```typescript
export function registerAllHandlers(
  router: Router,
  proxyManager: ProxyManager,
  deliveryQueue?: DeliveryQueue,
  gogManager?: GogManager,
  imagesDir?: string,
) {
```

Add registration call:
```typescript
registerVendorImageHandlers(router, imagesDir ?? getImagesDir());
```

Import `getImagesDir` from `../config/paths.js`.

**Step 5: Update vendor delete cascade in `handlers/vendors.ts`**

Add `vendorImages` to imports from schema. Add inside the delete transaction (before deleting the vendor):

```typescript
tx.delete(vendorImages).where(eq(vendorImages.vendorId, id)).run();
```

Note: This handles the DB cascade. File cleanup is handled by the ON DELETE CASCADE at the DB level for the records, but we also need to delete the files from disk. Add file cleanup before the transaction:

```typescript
import { deleteImageFile } from "../tools/save-image.js";
import { getImagesDir } from "../config/paths.js";
import fs from "node:fs";
import path from "node:path";
```

Before the transaction in the delete handler, add:
```typescript
// Clean up image files from disk
const imagesPath = path.join(getImagesDir(), String(id));
if (fs.existsSync(imagesPath)) {
  fs.rmSync(imagesPath, { recursive: true, force: true });
}
```

**Step 6: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/handlers/vendor-images.test.ts tests/handlers/vendors.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/gateway/src/handlers/vendor-images.ts packages/gateway/src/handlers/index.ts packages/gateway/src/handlers/vendors.ts packages/gateway/tests/handlers/vendor-images.test.ts
git commit -m "feat: add vendor-images handlers for upload, list, delete, reorder"
```

---

### Task 4: HTTP Image Serving

**Files:**
- Modify: `packages/gateway/src/infra/ws-server.ts`
- Modify: `packages/gateway/tests/ws-server.test.ts`

**Step 1: Write the failing test**

Add to `packages/gateway/tests/ws-server.test.ts` (or create a new test file):

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("HTTP image serving", () => {
  let tmpDir: string;
  let port: number;
  let close: () => Promise<void>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-http-test-"));
    // Create a test image
    const vendorDir = path.join(tmpDir, "1");
    fs.mkdirSync(vendorDir, { recursive: true });
    fs.writeFileSync(path.join(vendorDir, "test.png"), Buffer.from("fake-png"));

    // Import and start server — need the new createWsServer that accepts imagesDir
    const { createWsServer } = await import("../../src/infra/ws-server.js");
    port = 19876 + Math.floor(Math.random() * 1000);
    const server = await createWsServer({
      port,
      getState: () => ({ version: "test", channels: {} } as any),
      imagesDir: tmpDir,
    });
    close = server.close;
  });

  afterEach(async () => {
    await close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves an image file via HTTP GET", async () => {
    const res = await fetch(`http://localhost:${port}/images/1/test.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const body = await res.text();
    expect(body).toBe("fake-png");
  });

  it("returns 404 for missing images", async () => {
    const res = await fetch(`http://localhost:${port}/images/1/missing.png`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-image routes", async () => {
    const res = await fetch(`http://localhost:${port}/other`);
    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/ws-server.test.ts`
Expected: FAIL

**Step 3: Refactor ws-server.ts to use http.createServer**

Modify `packages/gateway/src/infra/ws-server.ts`:

Add at the top:
```typescript
import { createServer, type IncomingMessage as HttpIncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
```

Add `imagesDir?: string` to `WsServerOptions`.

Replace `const wss = new WebSocketServer({ port });` with:

```typescript
const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

function handleHttpRequest(req: HttpIncomingMessage, res: ServerResponse) {
  // Only serve GET /images/:vendorId/:filename
  if (req.method !== "GET" || !req.url) {
    res.writeHead(404);
    res.end();
    return;
  }

  const match = req.url.match(/^\/images\/(\d+)\/([^/]+)$/);
  if (!match || !imagesDir) {
    res.writeHead(404);
    res.end();
    return;
  }

  const [, vendorId, filename] = match;
  const filePath = path.join(imagesDir, vendorId, filename);

  // Prevent path traversal
  if (!filePath.startsWith(imagesDir)) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end();
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400",
  });
  fs.createReadStream(filePath).pipe(res);
}

const httpServer = createServer(handleHttpRequest);
const wss = new WebSocketServer({ server: httpServer });

await new Promise<void>((resolve) => {
  httpServer.listen(port, resolve);
});
```

Update the `close` function to close `httpServer` instead of `wss`:

```typescript
async function close(): Promise<void> {
  for (const client of clients) {
    client.ws.close(1000, "Server shutting down");
  }
  return new Promise((resolve, reject) => {
    wss.close(() => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });
}
```

Remove the old `await new Promise<void>((resolve) => { wss.on("listening", resolve); });` block.

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/ws-server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/infra/ws-server.ts packages/gateway/tests/ws-server.test.ts
git commit -m "feat: add HTTP image serving to gateway on same port as WebSocket"
```

---

### Task 5: Pass `imagesDir` Through Startup

**Files:**
- Modify: `packages/gateway/src/index.ts`

**Step 1: Update startGateway**

In `packages/gateway/src/index.ts`, import `getImagesDir`:
```typescript
import { getDbPath, getDataDir, getDeliveryQueueDir, getImagesDir } from "./config/paths.js";
```

Pass `imagesDir` to `createWsServer`:
```typescript
const imagesDir = getImagesDir();
const wsServer = await createWsServer({ port, getState, router, db, imagesDir });
```

Pass `imagesDir` to `registerAllHandlers`:
```typescript
registerAllHandlers(router, proxyManager, deliveryQueue, gogManager, imagesDir);
```

**Step 2: Verify gateway starts**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/gateway/src/index.ts
git commit -m "feat: wire imagesDir through gateway startup"
```

---

### Task 6: `addVendorImages` Agent Tool

**Files:**
- Create: `packages/gateway/src/tools/add-vendor-images.ts`
- Modify: `packages/gateway/src/tools/index.ts`
- Modify: `packages/gateway/src/agents/task-configs.ts`
- Test: `packages/gateway/tests/tools/add-vendor-images.test.ts`

**Step 1: Write the failing test**

Create `packages/gateway/tests/tools/add-vendor-images.test.ts`:

```typescript
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
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db };
}

describe("addVendorImages tool", () => {
  let db: ReturnType<typeof drizzle>;

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

    const result = await tool.execute(
      {
        vendorId: 1,
        images: [{ data: base64, mimeType: "image/png", caption: "Pool area" }],
      },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.saved).toBe(1);
    expect(result.images[0].caption).toBe("Pool area");

    // Verify DB
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

    const result = await tool.execute(
      {
        vendorId: 1,
        images: [{ url: "https://example.com/photo.png", caption: "Entrance" }],
      },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.saved).toBe(1);
    expect(result.images[0].caption).toBe("Entrance");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/add-vendor-images.test.ts`
Expected: FAIL

**Step 3: Create `add-vendor-images.ts`**

Create `packages/gateway/src/tools/add-vendor-images.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { vendorImages } from "../db/schema.js";
import { saveImageFromUrl, saveImageFromBase64 } from "./save-image.js";
import type { Db } from "../infra/router.js";

export interface AddVendorImagesContext {
  db: Db;
  emit: (action: string, detail?: string) => void;
  imagesDir: string;
  fetchFn?: (url: string) => Promise<Response>;
}

export function makeAddVendorImagesTool(ctx: AddVendorImagesContext) {
  return tool({
    description:
      "Add images to a vendor's photo gallery. Accepts URLs (downloaded automatically) or base64 data. Use this after scraping a vendor's website to save their photos.",
    inputSchema: z.object({
      vendorId: z.number().describe("The vendor ID to add images to"),
      images: z.array(
        z.object({
          url: z.string().optional().describe("Image URL to download"),
          data: z.string().optional().describe("Base64-encoded image data"),
          mimeType: z.string().optional().describe("MIME type (required with data), e.g. image/jpeg"),
          caption: z.string().optional().describe("Descriptive caption for the image"),
        }),
      ).describe("Array of images to add"),
    }),
    execute: async ({ vendorId, images }) => {
      ctx.emit("adding-images", `Adding ${images.length} image(s) to vendor ${vendorId}`);

      // Get current max sort order
      const existing = await ctx.db
        .select()
        .from(vendorImages)
        .where(eq(vendorImages.vendorId, vendorId));
      let nextOrder = existing.length;

      const results: Array<{ filename: string; caption: string | null }> = [];
      const errors: string[] = [];

      for (const image of images) {
        try {
          let filename: string;
          let originalUrl: string | null = null;

          if (image.url) {
            originalUrl = image.url;
            ({ filename } = await saveImageFromUrl(image.url, vendorId, ctx.imagesDir, ctx.fetchFn));
          } else if (image.data && image.mimeType) {
            ({ filename } = await saveImageFromBase64(image.data, image.mimeType, vendorId, ctx.imagesDir));
          } else {
            errors.push("Image must have either url or data+mimeType");
            continue;
          }

          await ctx.db.insert(vendorImages).values({
            vendorId,
            filename,
            originalUrl,
            caption: image.caption ?? null,
            sortOrder: nextOrder++,
          });

          results.push({ filename, caption: image.caption ?? null });
        } catch (err) {
          errors.push(`Failed to save image: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return { saved: results.length, failed: errors.length, images: results, errors };
    },
  });
}
```

**Step 4: Register tool in `tools/index.ts`**

Add import:
```typescript
import { makeAddVendorImagesTool } from "./add-vendor-images.js";
```

Add factory registration:
```typescript
registry.registerFactory("addVendorImages", {
  description: "Add images to a vendor's photo gallery",
  category: "database",
  create: (ctx: unknown) => {
    const { db, emit, imagesDir } = ctx as any;
    return makeAddVendorImagesTool({ db, emit, imagesDir });
  },
});
```

**Step 5: Add tool to research agent in `task-configs.ts`**

Update the research config tools array:
```typescript
tools: ["search", "scrape", "browse", "parsePdf", "createVendor", "addVendorImages", "cmd", "dbQuery", "dbSchema", "gog"],
```

Update the RESEARCH_PROMPT to mention the new tool:
```
- When fetching a vendor's website, look for gallery images and use addVendorImages to save relevant photos with descriptive captions
- Prefer saving 3-8 high-quality images rather than every image on the page
```

**Step 6: Pass `imagesDir` through orchestrator context**

Check `packages/gateway/src/agents/orchestrator.ts` to see how tool context is built. The orchestrator creates tools via `toolRegistry.createTools(toolNames, context)`. The context already includes `db`, `emit`, `workspaceDir`, `sqlite`, etc. Add `imagesDir` to the context object.

In `packages/gateway/src/index.ts`, the orchestrator is created. The tool context is built inside the orchestrator — check how it passes context. Add `imagesDir` to the orchestrator options, and ensure it's passed to the tool factory context.

Modify `packages/gateway/src/agents/orchestrator.ts`: Add `imagesDir` to the context passed to `toolRegistry.createTools`. Likely near where `workspaceDir` is set:

```typescript
imagesDir: this.options?.imagesDir ?? getImagesDir(),
```

Add `imagesDir` to the orchestrator options interface and pass it from `index.ts`.

**Step 7: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/tools/add-vendor-images.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/gateway/src/tools/add-vendor-images.ts packages/gateway/src/tools/index.ts packages/gateway/src/agents/task-configs.ts packages/gateway/src/agents/orchestrator.ts packages/gateway/src/index.ts packages/gateway/tests/tools/add-vendor-images.test.ts
git commit -m "feat: add addVendorImages agent tool with URL and base64 support"
```

---

### Task 7: Enhance Scraper to Extract Gallery Images

**Files:**
- Modify: `packages/gateway/src/tools/scraper.ts`
- Modify: `packages/gateway/tests/tools/scraper.test.ts`

**Step 1: Write the failing test**

Add to `packages/gateway/tests/tools/scraper.test.ts`:

```typescript
it("extracts image URLs from page content", () => {
  const htmlWithGallery = `
    <html>
    <head>
      <title>Villa Gallery</title>
      <meta property="og:image" content="https://villa.it/og.jpg" />
    </head>
    <body>
      <main>
        <img src="https://villa.it/gallery/photo1.jpg" alt="Garden" />
        <img src="https://villa.it/gallery/photo2.jpg" alt="Pool" />
        <img src="/small-icon.png" alt="icon" width="20" height="20" />
        <img src="data:image/png;base64,abc" alt="inline" />
      </main>
    </body>
    </html>
  `;
  const result = scrapeHtml("https://villa.it", htmlWithGallery);
  expect(result.images).toBeDefined();
  // Should include gallery images but not tiny icons or data URIs
  expect(result.images).toContain("https://villa.it/gallery/photo1.jpg");
  expect(result.images).toContain("https://villa.it/gallery/photo2.jpg");
  // Should not include data URIs
  expect(result.images!.every((url: string) => !url.startsWith("data:"))).toBe(true);
});

it("resolves relative image URLs", () => {
  const html = `
    <html><body>
      <img src="/images/hero.jpg" alt="Hero" />
    </body></html>
  `;
  const result = scrapeHtml("https://villa.it/about", html);
  expect(result.images).toContain("https://villa.it/images/hero.jpg");
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/scraper.test.ts`
Expected: FAIL — `images` property doesn't exist

**Step 3: Add image extraction to scraper**

In `packages/gateway/src/tools/scraper.ts`:

Update `ScrapedPage` interface to add:
```typescript
images: string[];
```

Update `scrapeHtml` to extract images before the `extractText` call (which removes elements):

```typescript
// Extract images before removing elements
const images: string[] = [];
$("img").each((_, el) => {
  const src = $(el).attr("src");
  if (!src || src.startsWith("data:")) return;

  // Skip tiny icons (if width/height attributes suggest < 50px)
  const w = parseInt($(el).attr("width") ?? "0", 10);
  const h = parseInt($(el).attr("height") ?? "0", 10);
  if ((w > 0 && w < 50) || (h > 0 && h < 50)) return;

  // Resolve relative URLs
  try {
    const resolved = new URL(src, url).href;
    images.push(resolved);
  } catch {
    // Invalid URL, skip
  }
});

// Deduplicate
const uniqueImages = [...new Set(images)];
```

Add `images: uniqueImages` to the return object.

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/tools/scraper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/tools/scraper.ts packages/gateway/tests/tools/scraper.test.ts
git commit -m "feat: extract gallery image URLs from scraped pages"
```

---

### Task 8: Frontend — `useVendorImages` Hook

**Files:**
- Create: `packages/app/src/renderer/hooks/useVendorImages.ts`

**Step 1: Create the hook**

```typescript
import { useRequest, useMutation } from "./useRequest";

export interface VendorImage {
  id: number;
  vendorId: number;
  filename: string;
  originalUrl: string | null;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
}

export function useVendorImages(vendorId: number) {
  return useRequest<VendorImage[]>("vendor-images.list", { vendorId });
}

export function useUploadVendorImage() {
  return useMutation<{
    vendorId: number;
    base64: string;
    mimeType: string;
    caption?: string;
  }>("vendor-images.upload");
}

export function useDeleteVendorImage() {
  return useMutation<{ id: number }>("vendor-images.delete");
}

export function useReorderVendorImages() {
  return useMutation<{ order: Array<{ id: number; sortOrder: number }> }>(
    "vendor-images.reorder",
  );
}
```

**Step 2: Commit**

```bash
git add packages/app/src/renderer/hooks/useVendorImages.ts
git commit -m "feat: add useVendorImages hook for frontend image operations"
```

---

### Task 9: Frontend — Gateway Port Helper

The frontend needs to construct HTTP URLs for images. It needs access to the gateway port.

**Files:**
- Create: `packages/app/src/renderer/lib/gateway-url.ts`

**Step 1: Create helper**

```typescript
import { useGatewayStore } from "../stores/gateway-store";

// Cached port — set once on connect
let cachedPort: number | null = null;

export async function getGatewayPort(): Promise<number> {
  if (cachedPort) return cachedPort;
  cachedPort = await window.electronAPI.getGatewayPort();
  return cachedPort;
}

export function getImageUrl(vendorId: number, filename: string): string {
  // The gateway port is known once ws-client connects
  // Use a sync approach: read from the store or fallback
  const port = cachedPort ?? 4513; // DEFAULT_GATEWAY_PORT fallback
  return `http://localhost:${port}/images/${vendorId}/${filename}`;
}

// Call this once on startup after getGatewayPort resolves
export function setGatewayPort(port: number) {
  cachedPort = port;
}
```

Check `packages/app/src/renderer/stores/gateway-store.ts` to see if port is already stored there. If so, just read from the store instead. The `ws-client.ts` already calls `window.electronAPI.getGatewayPort()` — we can cache the port there and export it.

Simpler approach: just add to `ws-client.ts`:

```typescript
get gatewayPort(): number | null {
  return this.port;
}
```

Then in components:
```typescript
import { wsClient } from "../lib/ws-client";
const imageUrl = `http://localhost:${wsClient.gatewayPort}/images/${vendorId}/${filename}`;
```

**Step 2: Commit**

```bash
git add packages/app/src/renderer/lib/gateway-url.ts
git commit -m "feat: add gateway image URL helper"
```

---

### Task 10: Frontend — VendorPhotos Component

**Files:**
- Create: `packages/app/src/renderer/components/vendors/VendorPhotos.tsx`
- Modify: `packages/app/src/renderer/components/vendors/VendorDetailView.tsx`

**Step 1: Create VendorPhotos component**

Create `packages/app/src/renderer/components/vendors/VendorPhotos.tsx`:

```tsx
import { useState, useCallback } from "react";
import { Plus, Trash2, ChevronLeft, ChevronRight, X, ImageIcon } from "lucide-react";
import { useVendorImages, useUploadVendorImage, useDeleteVendorImage } from "../../hooks/useVendorImages";
import { wsClient } from "../../lib/ws-client";
import { ConfirmDialog } from "../common/ConfirmDialog";

function getImageUrl(vendorId: number, filename: string): string {
  return `http://localhost:${wsClient.gatewayPort}/images/${vendorId}/${filename}`;
}

export function VendorPhotos({ vendorId }: { vendorId: number }) {
  const { data: images, refetch } = useVendorImages(vendorId);
  const { mutate: uploadImage } = useUploadVendorImage();
  const { mutate: deleteImage } = useDeleteVendorImage();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
        );
        await uploadImage({
          vendorId,
          base64,
          mimeType: file.type,
        });
      }
      refetch();
    },
    [vendorId, uploadImage, refetch],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleAddClick = useCallback(async () => {
    const result = await window.electronAPI?.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    });
    if (result?.filePaths?.length) {
      // Read files and upload — need to read via fetch from file:// or IPC
      // For Electron, use the file paths to read and convert to base64
      for (const filePath of result.filePaths) {
        const res = await fetch(`file://${filePath}`);
        const buffer = await res.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
        );
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "jpg";
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
          gif: "image/gif",
        };
        await uploadImage({
          vendorId,
          base64,
          mimeType: mimeMap[ext] ?? "image/jpeg",
        });
      }
      refetch();
    }
  }, [vendorId, uploadImage, refetch]);

  const handleDelete = useCallback(
    async (imageId: number) => {
      await deleteImage({ id: imageId });
      setDeleteConfirm(null);
      setLightboxIndex(null);
      refetch();
    },
    [deleteImage, refetch],
  );

  const photoList = images ?? [];

  return (
    <div>
      {/* Header with add button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400">
          {photoList.length} photo{photoList.length !== 1 ? "s" : ""}
        </h3>
        <button
          onClick={handleAddClick}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Photos
        </button>
      </div>

      {/* Drop zone / grid */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`${
          dragging ? "ring-2 ring-blue-500/50 bg-blue-500/5" : ""
        } transition-all rounded-xl`}
      >
        {photoList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 border border-dashed border-white/10 rounded-xl">
            <ImageIcon className="h-10 w-10 mb-3 text-gray-600" />
            <p className="text-sm">No photos yet</p>
            <p className="text-xs text-gray-600 mt-1">
              Ask the research agent to find some, or drag and drop your own
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photoList.map((image, index) => (
              <button
                key={image.id}
                onClick={() => setLightboxIndex(index)}
                className="group relative aspect-square overflow-hidden rounded-lg bg-white/5"
              >
                <img
                  src={getImageUrl(vendorId, image.filename)}
                  alt={image.caption ?? ""}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
                {image.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-xs text-white truncate">{image.caption}</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && photoList[lightboxIndex] && (
        <Lightbox
          images={photoList}
          vendorId={vendorId}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDelete={(id) => setDeleteConfirm(id)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Delete photo?"
        message="This will permanently remove this photo."
        onConfirm={() => deleteConfirm !== null && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

function Lightbox({
  images,
  vendorId,
  currentIndex,
  onClose,
  onNavigate,
  onDelete,
}: {
  images: Array<{ id: number; filename: string; caption: string | null }>;
  vendorId: number;
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete: (id: number) => void;
}) {
  const image = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && hasNext) onNavigate(currentIndex + 1);
    },
    [onClose, onNavigate, currentIndex, hasPrev, hasNext],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      ref={(el) => el?.focus()}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/60 hover:text-white transition-colors"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Delete button */}
        <button
          onClick={() => onDelete(image.id)}
          className="absolute -top-10 left-0 flex items-center gap-1 text-red-400/60 hover:text-red-400 text-sm transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>

        {/* Image */}
        <img
          src={getImageUrl(vendorId, image.filename)}
          alt={image.caption ?? ""}
          className="max-h-[80vh] max-w-[90vw] object-contain rounded-lg"
        />

        {/* Caption */}
        {image.caption && (
          <p className="mt-3 text-sm text-gray-300">{image.caption}</p>
        )}

        {/* Counter */}
        <p className="mt-1 text-xs text-gray-500">
          {currentIndex + 1} / {images.length}
        </p>

        {/* Navigation arrows */}
        {hasPrev && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className="absolute left-[-3rem] top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className="absolute right-[-3rem] top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Add Photos tab to VendorDetailView**

In `packages/app/src/renderer/components/vendors/VendorDetailView.tsx`:

Add import:
```typescript
import { VendorPhotos } from "./VendorPhotos";
```

Update TABS:
```typescript
const TABS = ["Overview", "Photos", "Quotes", "Communications", "Notes"] as const;
```

Add tab content:
```typescript
{activeTab === "Photos" && <VendorPhotos vendorId={vendorId} />}
```

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/vendors/VendorPhotos.tsx packages/app/src/renderer/components/vendors/VendorDetailView.tsx
git commit -m "feat: add Photos tab with grid, lightbox, and drag-drop upload"
```

---

### Task 11: Update VendorHeader Thumbnail

**Files:**
- Modify: `packages/app/src/renderer/components/vendors/VendorHeader.tsx`

**Step 1: Update VendorHeader to use gallery images**

Import the hook:
```typescript
import { useVendorImages } from "../../hooks/useVendorImages";
import { wsClient } from "../../lib/ws-client";
```

Inside the component, add:
```typescript
const { data: galleryImages } = useVendorImages(vendor.id);
const firstGalleryImage = galleryImages?.[0];

// Prefer gallery image over legacy imageUrl
const thumbnailSrc = firstGalleryImage
  ? `http://localhost:${wsClient.gatewayPort}/images/${vendor.id}/${firstGalleryImage.filename}`
  : vendor.imageUrl;

const showImage = thumbnailSrc && !imgError;
```

Update the `<img>` tag:
```tsx
{showImage && (
  <img
    src={thumbnailSrc!}
    alt=""
    onError={() => setImgError(true)}
    className="h-20 w-20 rounded-lg object-cover shrink-0"
  />
)}
```

**Step 2: Commit**

```bash
git add packages/app/src/renderer/components/vendors/VendorHeader.tsx
git commit -m "feat: vendor header thumbnail uses gallery images with imageUrl fallback"
```

---

### Task 12: Expose `gatewayPort` on WsClient

**Files:**
- Modify: `packages/app/src/renderer/lib/ws-client.ts`

**Step 1: Add getter**

Add to the `WsClient` class:
```typescript
get gatewayPort(): number | null {
  return this.port;
}
```

**Step 2: Commit**

```bash
git add packages/app/src/renderer/lib/ws-client.ts
git commit -m "feat: expose gateway port from ws-client for image URLs"
```

---

### Task 13: Integration Testing — Run All Tests

**Step 1: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 2: Manual smoke test**

1. Start the app: `npm run dev`
2. Navigate to a vendor detail page
3. Verify "Photos" tab appears
4. Drag-drop an image onto the empty state
5. Verify image appears in grid
6. Click image → verify lightbox opens
7. Use arrow keys to navigate (if multiple images)
8. Delete an image from lightbox
9. Verify vendor header shows gallery thumbnail

**Step 3: Final commit if any fixes needed**

---

### Task 14: Update Vendor Delete Cascade Test

**Files:**
- Modify: `packages/gateway/tests/handlers/vendors.test.ts`

**Step 1: Add vendor images to cascade test**

In the "cascade-deletes all vendor children" test, add vendor images:

```typescript
// Add images
await router.handle(db, "vendor-images.upload", {
  vendorId,
  base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  mimeType: "image/png",
  caption: "Test photo",
});
```

After delete, verify:
```typescript
const images = (await router.handle(db, "vendor-images.list", { vendorId })) as unknown[];
expect(images).toHaveLength(0);
```

**Step 2: Run tests**

Run: `cd packages/gateway && npx vitest run tests/handlers/vendors.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/gateway/tests/handlers/vendors.test.ts
git commit -m "test: add vendor images to cascade delete test"
```
