import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerWeddingConfigHandlers } from "../../src/handlers/wedding-config.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerWeddingConfigHandlers(router);
  return { db, router };
}

describe("wedding-config handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(() => {
    ({ db, router } = setup());
  });

  it("returns defaults when no config exists", async () => {
    const result = (await router.handle(db, "wedding-config.get", undefined)) as Record<string, unknown>;
    expect(result.currency).toBe("EUR");
    expect(result.languagePreferences).toEqual(["en", "it"]);
    expect(result.weddingDate).toBeNull();
  });

  it("creates config on first update", async () => {
    const result = (await router.handle(db, "wedding-config.update", {
      coupleNames: "Rob & Partner",
      guestCount: 60,
      budgetTotal: 50000,
      location: "Ischia, Italy",
    })) as Record<string, unknown>;

    expect(result.coupleNames).toBe("Rob & Partner");
    expect(result.guestCount).toBe(60);
    expect(result.budgetTotal).toBe(50000);
    expect(result.location).toBe("Ischia, Italy");
  });

  it("updates existing config", async () => {
    await router.handle(db, "wedding-config.update", { guestCount: 60 });
    const result = (await router.handle(db, "wedding-config.update", {
      guestCount: 80,
    })) as Record<string, unknown>;

    expect(result.guestCount).toBe(80);
  });

  it("persists language preferences as JSON", async () => {
    await router.handle(db, "wedding-config.update", {
      languagePreferences: ["en", "it", "fr"],
    });
    const result = (await router.handle(db, "wedding-config.get", undefined)) as Record<string, unknown>;
    expect(result.languagePreferences).toEqual(["en", "it", "fr"]);
  });
});
