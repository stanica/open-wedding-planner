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

describe("vendor handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
  });

  it("creates and retrieves a vendor", async () => {
    const created = (await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Villa dei Fiori",
      location: "Ischia",
      status: "researched",
    })) as Record<string, unknown>;

    expect(created.id).toBe(1);
    expect(created.name).toBe("Villa dei Fiori");

    const fetched = (await router.handle(db, "vendors.get", { id: 1 })) as Record<string, unknown>;
    expect(fetched.name).toBe("Villa dei Fiori");
    expect(fetched.location).toBe("Ischia");
  });

  it("lists vendors with filters", async () => {
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Venue A",
      status: "researched",
    });
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Venue B",
      status: "contacted",
    });
    await router.handle(db, "vendors.create", {
      categoryId: 3,
      name: "Photographer A",
      status: "researched",
    });

    const all = (await router.handle(db, "vendors.list", {})) as unknown[];
    expect(all).toHaveLength(3);

    const byCat = (await router.handle(db, "vendors.list", { categoryId: 1 })) as unknown[];
    expect(byCat).toHaveLength(2);

    const byStatus = (await router.handle(db, "vendors.list", {
      status: "contacted",
    })) as unknown[];
    expect(byStatus).toHaveLength(1);
  });

  it("updates a vendor", async () => {
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Venue A",
      status: "researched",
    });
    const updated = (await router.handle(db, "vendors.update", {
      id: 1,
      status: "contacted",
      contactEmail: "info@venue.it",
    })) as Record<string, unknown>;

    expect(updated.status).toBe("contacted");
    expect(updated.contactEmail).toBe("info@venue.it");
  });

  it("deletes a vendor", async () => {
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Venue A",
      status: "researched",
    });
    await router.handle(db, "vendors.delete", { id: 1 });

    const all = (await router.handle(db, "vendors.list", {})) as unknown[];
    expect(all).toHaveLength(0);
  });

  it("cascade-deletes all vendor children", async () => {
    // Create vendor with children in every related table
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Vendor With Data",
      status: "quoted",
    });
    const vendorId = 1;

    // Add attributes
    await router.handle(db, "vendor-attributes.set", {
      vendorId,
      key: "capacity",
      value: "100",
    });

    // Add quotes with line items
    await router.handle(db, "quotes.create", {
      vendorId,
      totalAmount: 5000,
      currency: "EUR",
      source: "email",
      lineItems: [{ description: "Item", amount: 5000, pricingType: "flat" }],
    });

    // Add communication
    await db.insert(schema.communications).values({
      vendorId,
      direction: "out",
      channel: "email",
      bodyOriginal: "Hello",
      status: "draft",
    });

    // Add research note
    await db.insert(schema.researchNotes).values({
      vendorId,
      content: "Test note",
      sourceType: "web",
    });

    // Add budget entry referencing vendor
    await router.handle(db, "budget.create", {
      categoryId: 1,
      vendorId,
      description: "Venue deposit",
      estimatedActual: 1000,
    });

    // Add task referencing vendor
    await router.handle(db, "tasks.create", {
      title: "Contact venue",
      vendorId,
      status: "pending",
    });

    // Delete vendor
    await router.handle(db, "vendors.delete", { id: vendorId });

    // Verify vendor is gone
    const vendors = (await router.handle(db, "vendors.list", {})) as unknown[];
    expect(vendors).toHaveLength(0);

    // Verify children are gone
    const attrs = (await router.handle(db, "vendor-attributes.list", { vendorId })) as unknown[];
    expect(attrs).toHaveLength(0);

    const quotes = (await router.handle(db, "quotes.list", { vendorId })) as unknown[];
    expect(quotes).toHaveLength(0);

    const comms = (await router.handle(db, "communications.list", { vendorId })) as unknown[];
    expect(comms).toHaveLength(0);

    const notes = (await router.handle(db, "research-notes.list", { vendorId })) as unknown[];
    expect(notes).toHaveLength(0);

    // Verify budget entry still exists but vendorId is null
    const budget = (await router.handle(db, "budget.list", {})) as Array<Record<string, unknown>>;
    expect(budget).toHaveLength(1);
    expect(budget[0].vendorId).toBeNull();

    // Verify task still exists but vendorId is null
    const taskList = (await router.handle(db, "tasks.list", {})) as Array<Record<string, unknown>>;
    expect(taskList).toHaveLength(1);
    expect(taskList[0].vendorId).toBeNull();
  });

  it("manages vendor attributes", async () => {
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Venue A",
      status: "researched",
    });

    await router.handle(db, "vendor-attributes.set", {
      vendorId: 1,
      key: "capacity",
      value: "120",
      type: "number",
    });

    const attrs = (await router.handle(db, "vendor-attributes.list", {
      vendorId: 1,
    })) as Array<Record<string, unknown>>;
    expect(attrs).toHaveLength(1);
    expect(attrs[0].key).toBe("capacity");
    expect(attrs[0].value).toBe("120");

    // Update attribute
    await router.handle(db, "vendor-attributes.set", {
      vendorId: 1,
      key: "capacity",
      value: "150",
    });
    const updated = (await router.handle(db, "vendor-attributes.list", {
      vendorId: 1,
    })) as Array<Record<string, unknown>>;
    expect(updated).toHaveLength(1);
    expect(updated[0].value).toBe("150");
  });
});
