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
import { getImagesDir } from "../../src/config/paths.js";

let tmpDir: string;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-data-mgmt-test-"));
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerAllHandlers(router, undefined as any, undefined, undefined, tmpDir);
  return { db, router };
}

describe("data management handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("clear-vendors removes all vendors and related data", async () => {
    // Create a vendor with a quote
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Villa Ischia",
      status: "quoted",
    });

    await router.handle(db, "quotes.create", {
      vendorId: 1,
      totalAmount: 5000,
      currency: "EUR",
      source: "email",
    });

    // Verify they exist
    const vendorsBefore = (await router.handle(db, "vendors.list", {})) as unknown[];
    expect(vendorsBefore).toHaveLength(1);

    const quotesBefore = (await router.handle(db, "quotes.list", { vendorId: 1 })) as unknown[];
    expect(quotesBefore).toHaveLength(1);

    // Clear vendors
    const result = await router.handle(db, "data.clear-vendors", {});
    expect(result).toEqual({ ok: true });

    // Verify vendors list is empty
    const vendorsAfter = (await router.handle(db, "vendors.list", {})) as unknown[];
    expect(vendorsAfter).toHaveLength(0);

    // Verify quotes are also gone
    const quotesAfter = (await router.handle(db, "quotes.list", { vendorId: 1 })) as unknown[];
    expect(quotesAfter).toHaveLength(0);
  });

  it("clear-vendors cleans up image directories", async () => {
    // Create vendor
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Photo Venue",
      status: "researched",
    });

    // Create image directory on disk in the real images dir
    const imagesDir = getImagesDir();
    const vendorImagesPath = path.join(imagesDir, "1");
    fs.mkdirSync(vendorImagesPath, { recursive: true });
    fs.writeFileSync(path.join(vendorImagesPath, "photo.jpg"), "fake-image-data");
    expect(fs.existsSync(vendorImagesPath)).toBe(true);

    // Clear vendors
    await router.handle(db, "data.clear-vendors", {});

    // Verify image directory is gone
    expect(fs.existsSync(vendorImagesPath)).toBe(false);
  });

  it("clear-research removes threads and messages", async () => {
    // Create a research thread with a message
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Venue research",
    })) as Record<string, unknown>;

    await router.handle(db, "research.messages.create", {
      threadId: thread.id,
      role: "user",
      content: "Find villas in Ischia",
    });

    // Verify they exist
    const threadsBefore = (await router.handle(db, "research.threads.list", {})) as unknown[];
    expect(threadsBefore).toHaveLength(1);

    const messagesBefore = (await router.handle(db, "research.messages.list", {
      threadId: thread.id,
    })) as unknown[];
    expect(messagesBefore).toHaveLength(1);

    // Clear research
    const result = await router.handle(db, "data.clear-research", {});
    expect(result).toEqual({ ok: true });

    // Verify threads list is empty
    const threadsAfter = (await router.handle(db, "research.threads.list", {})) as unknown[];
    expect(threadsAfter).toHaveLength(0);
  });

  it("clear-communications removes all communications", async () => {
    // Create a vendor (needed as FK for communications)
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Test Vendor",
      status: "contacted",
    });

    // Create a communication via direct insert (no handler for create)
    await db.insert(schema.communications).values({
      vendorId: 1,
      direction: "out",
      channel: "email",
      bodyOriginal: "Hello, we are interested in your venue.",
      status: "draft",
    });

    // Verify it exists
    const commsBefore = (await router.handle(db, "communications.list", {})) as unknown[];
    expect(commsBefore).toHaveLength(1);

    // Clear communications
    const result = await router.handle(db, "data.clear-communications", {});
    expect(result).toEqual({ ok: true });

    // Verify communications are empty
    const commsAfter = (await router.handle(db, "communications.list", {})) as unknown[];
    expect(commsAfter).toHaveLength(0);
  });

  it("clear-tasks removes tasks, agent tasks, and budget entries", async () => {
    // Create a task
    await router.handle(db, "tasks.create", {
      title: "Book venue tour",
      categoryId: 1,
    });

    // Create a budget entry
    await router.handle(db, "budget.create", {
      categoryId: 1,
      description: "Venue deposit",
    });

    // Verify they exist
    const tasksBefore = (await router.handle(db, "tasks.list", {})) as unknown[];
    expect(tasksBefore).toHaveLength(1);

    const budgetBefore = (await router.handle(db, "budget.list", {})) as unknown[];
    expect(budgetBefore).toHaveLength(1);

    // Clear tasks
    const result = await router.handle(db, "data.clear-tasks", {});
    expect(result).toEqual({ ok: true });

    // Verify both are empty
    const tasksAfter = (await router.handle(db, "tasks.list", {})) as unknown[];
    expect(tasksAfter).toHaveLength(0);

    const budgetAfter = (await router.handle(db, "budget.list", {})) as unknown[];
    expect(budgetAfter).toHaveLength(0);
  });

  it("clear-vendors does not affect config tables", async () => {
    // Create a vendor
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Venue to clear",
      status: "researched",
    });

    // Verify wedding-config works before
    const configBefore = (await router.handle(db, "wedding-config.get", {})) as Record<string, unknown>;
    expect(configBefore).toBeDefined();

    // Clear vendors
    await router.handle(db, "data.clear-vendors", {});

    // Verify vendors are gone
    const vendorsAfter = (await router.handle(db, "vendors.list", {})) as unknown[];
    expect(vendorsAfter).toHaveLength(0);

    // Verify wedding-config still works
    const configAfter = (await router.handle(db, "wedding-config.get", {})) as Record<string, unknown>;
    expect(configAfter).toBeDefined();
    expect(configAfter).toEqual(configBefore);
  });
});
