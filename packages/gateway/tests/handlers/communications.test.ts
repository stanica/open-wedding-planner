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

describe("communication handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Test Vendor",
      status: "contacted",
    });
  });

  describe("compound filtering", () => {
    beforeEach(async () => {
      // Create a second vendor for vendorId filtering
      await router.handle(db, "vendors.create", {
        categoryId: 1,
        name: "Second Vendor",
        status: "researched",
      });

      // Seed diverse communications
      await db.insert(schema.communications).values([
        {
          vendorId: 1,
          direction: "out",
          channel: "email",
          bodyOriginal: "Outbound email draft",
          status: "draft",
        },
        {
          vendorId: 1,
          direction: "out",
          channel: "whatsapp",
          bodyOriginal: "Outbound whatsapp sent",
          status: "sent",
        },
        {
          vendorId: 1,
          direction: "in",
          channel: "email",
          bodyOriginal: "Inbound email received",
          status: "received",
        },
        {
          vendorId: 2,
          direction: "out",
          channel: "email",
          bodyOriginal: "Vendor 2 outbound email draft",
          status: "draft",
        },
        {
          vendorId: 2,
          direction: "in",
          channel: "whatsapp",
          bodyOriginal: "Vendor 2 inbound whatsapp",
          status: "received",
        },
      ]);
    });

    it("returns all when no filters", async () => {
      const result = (await router.handle(
        db,
        "communications.list",
        {},
      )) as unknown[];
      expect(result).toHaveLength(5);
    });

    it("filters by direction AND status together", async () => {
      const result = (await router.handle(db, "communications.list", {
        direction: "out",
        status: "draft",
      })) as Array<Record<string, unknown>>;
      expect(result).toHaveLength(2);
      for (const r of result) {
        expect(r.direction).toBe("out");
        expect(r.status).toBe("draft");
      }
    });

    it("filters by direction AND channel together", async () => {
      const result = (await router.handle(db, "communications.list", {
        direction: "out",
        channel: "whatsapp",
      })) as Array<Record<string, unknown>>;
      expect(result).toHaveLength(1);
      expect(result[0].direction).toBe("out");
      expect(result[0].channel).toBe("whatsapp");
    });

    it("filters by vendorId AND direction", async () => {
      const result = (await router.handle(db, "communications.list", {
        vendorId: 2,
        direction: "out",
      })) as Array<Record<string, unknown>>;
      expect(result).toHaveLength(1);
      expect(result[0].vendorId).toBe(2);
      expect(result[0].direction).toBe("out");
    });
  });

  it("deletes a communication", async () => {
    await db.insert(schema.communications).values({
      vendorId: 1,
      direction: "out",
      channel: "email",
      subject: "Test",
      bodyOriginal: "Hello",
      status: "draft",
    });

    const before = (await router.handle(db, "communications.list", {
      vendorId: 1,
    })) as unknown[];
    expect(before).toHaveLength(1);

    await router.handle(db, "communications.delete", { id: 1 });

    const after = (await router.handle(db, "communications.list", {
      vendorId: 1,
    })) as unknown[];
    expect(after).toHaveLength(0);
  });
});
