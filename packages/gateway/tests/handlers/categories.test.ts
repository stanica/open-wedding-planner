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

describe("category handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
  });

  it("deletes an empty category", async () => {
    const [created] = await db
      .insert(schema.categories)
      .values({ name: "Test Cat", budgetPercentLow: 0, budgetPercentHigh: 0, sortOrder: 99 })
      .returning();

    await router.handle(db, "categories.delete", { id: created.id });

    const cats = (await router.handle(db, "categories.list", {})) as unknown[];
    expect(cats.find((c: any) => c.id === created.id)).toBeUndefined();
  });

  it("rejects deleting a category with assigned vendors", async () => {
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Venue A",
      status: "researched",
    });

    await expect(
      router.handle(db, "categories.delete", { id: 1 }),
    ).rejects.toThrow(/vendors/i);
  });
});
