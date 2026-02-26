import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerToolPermissionHandlers } from "../../src/handlers/tool-permissions.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerToolPermissionHandlers(router);
  return { db, router };
}

describe("tool permission handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(() => {
    ({ db, router } = setup());
  });

  it("lists permissions (empty initially)", async () => {
    const result = await router.handle(db, "tools.permissions.list", {});
    expect(result).toEqual([]);
  });

  it("updates a permission to allow", async () => {
    await router.handle(db, "tools.permissions.update", {
      toolName: "search",
      decision: "allow",
    });
    const list = (await router.handle(db, "tools.permissions.list", {})) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0].toolName).toBe("search");
    expect(list[0].decision).toBe("allow");
  });

  it("upserts on repeated updates", async () => {
    await router.handle(db, "tools.permissions.update", {
      toolName: "search",
      decision: "allow",
    });
    await router.handle(db, "tools.permissions.update", {
      toolName: "search",
      decision: "deny",
    });
    const list = (await router.handle(db, "tools.permissions.list", {})) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0].decision).toBe("deny");
  });

  it("gets a single permission", async () => {
    await router.handle(db, "tools.permissions.update", {
      toolName: "scrape",
      decision: "allow",
    });
    const result = await router.handle(db, "tools.permissions.get", { toolName: "scrape" });
    expect(result).toMatchObject({ toolName: "scrape", decision: "allow" });
  });

  it("returns null for unknown tool permission", async () => {
    const result = await router.handle(db, "tools.permissions.get", { toolName: "unknown" });
    expect(result).toBeNull();
  });
});
