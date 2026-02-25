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

describe("quote handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
    await router.handle(db, "vendors.create", {
      categoryId: 1,
      name: "Villa Test",
      status: "quoted",
    });
  });

  it("creates a quote with line items", async () => {
    const quote = (await router.handle(db, "quotes.create", {
      vendorId: 1,
      totalAmount: 15000,
      currency: "EUR",
      source: "email",
      lineItems: [
        {
          description: "Venue hire",
          amount: 5000,
          pricingType: "flat",
        },
        {
          description: "Catering per person",
          amount: 10000,
          pricingType: "per_person",
          unitPrice: 150,
          quantity: 60,
        },
      ],
    })) as Record<string, unknown>;

    expect(quote.id).toBe(1);
    expect(quote.totalAmount).toBe(15000);
    const lineItems = quote.lineItems as unknown[];
    expect(lineItems).toHaveLength(2);
  });

  it("retrieves a quote with line items", async () => {
    await router.handle(db, "quotes.create", {
      vendorId: 1,
      totalAmount: 5000,
      currency: "EUR",
      source: "web",
      lineItems: [{ description: "Package", amount: 5000, pricingType: "flat" }],
    });

    const quote = (await router.handle(db, "quotes.get", { id: 1 })) as Record<string, unknown>;
    expect(quote.totalAmount).toBe(5000);
    expect((quote.lineItems as unknown[]).length).toBe(1);
  });

  it("lists quotes by vendor", async () => {
    await router.handle(db, "quotes.create", {
      vendorId: 1,
      totalAmount: 5000,
      currency: "EUR",
      source: "email",
    });
    await router.handle(db, "quotes.create", {
      vendorId: 1,
      totalAmount: 7000,
      currency: "EUR",
      source: "pdf",
    });

    const quotes = (await router.handle(db, "quotes.list", {
      vendorId: 1,
    })) as unknown[];
    expect(quotes).toHaveLength(2);
  });

  it("deletes a quote and its line items", async () => {
    await router.handle(db, "quotes.create", {
      vendorId: 1,
      totalAmount: 5000,
      currency: "EUR",
      source: "email",
      lineItems: [{ description: "Item", amount: 5000, pricingType: "flat" }],
    });

    await router.handle(db, "quotes.delete", { id: 1 });
    const quotes = (await router.handle(db, "quotes.list", {
      vendorId: 1,
    })) as unknown[];
    expect(quotes).toHaveLength(0);
  });
});
