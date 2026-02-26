import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { Router } from "../../src/infra/router.js";
import { registerAllHandlers } from "../../src/handlers/index.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerAllHandlers(router);
  return { db, router };
}

describe("research-notes handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Test Vendor",
      status: "researched",
    });
  });

  it("lists research notes by vendor", async () => {
    await db.insert(schema.researchNotes).values({
      vendorId: 1,
      content: "Great reviews online",
      sourceType: "web",
    });
    await db.insert(schema.researchNotes).values({
      vendorId: 1,
      content: "Located near venue",
      sourceType: "manual",
    });

    const notes = (await router.handle(db, "research-notes.list", {
      vendorId: 1,
    })) as unknown[];
    expect(notes).toHaveLength(2);
  });

  it("deletes a research note", async () => {
    const [note] = await db
      .insert(schema.researchNotes)
      .values({ vendorId: 1, content: "Test note", sourceType: "web" })
      .returning();

    await router.handle(db, "research-notes.delete", { id: note.id });

    const notes = (await router.handle(db, "research-notes.list", {
      vendorId: 1,
    })) as unknown[];
    expect(notes).toHaveLength(0);
  });
});
