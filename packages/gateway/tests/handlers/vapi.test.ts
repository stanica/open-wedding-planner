import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { seedCategories } from "../../src/db/seed.js";
import { Router } from "../../src/infra/router.js";
import { registerVapiHandlers } from "../../src/handlers/vapi.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerVapiHandlers(router);
  return { db, router };
}

describe("VAPI handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);

    // Seed a vendor
    db.insert(schema.vendors)
      .values({
        name: "Mary's Flowers",
        contactPhone: "+15551234567",
        categoryId: 1,
        status: "researched",
      })
      .run();
  });

  describe("vapi.listCalls", () => {
    it("returns empty list initially", async () => {
      const result = await router.handle(db, "vapi.listCalls", {});
      expect(result).toEqual([]);
    });

    it("returns calls with vendor names", async () => {
      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "ended",
        instructions: "Ask about pricing",
        summary: "They quoted $500",
      });

      const result = (await router.handle(db, "vapi.listCalls", {})) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].vendorName).toBe("Mary's Flowers");
      expect(result[0].summary).toBe("They quoted $500");
    });
  });

  describe("vapi.getCall", () => {
    it("returns a single call by ID", async () => {
      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "ended",
        instructions: "Ask about pricing",
      });

      const result = (await router.handle(db, "vapi.getCall", {
        id: 1,
      })) as any;
      expect(result.phoneNumber).toBe("+15551234567");
    });

    it("throws if call not found", async () => {
      await expect(
        router.handle(db, "vapi.getCall", { id: 999 }),
      ).rejects.toThrow("not found");
    });
  });
});
