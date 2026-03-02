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

describe("research chat flow", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(async () => {
    ({ db, router } = setup());
    await seedCategories(db);
  });

  it("creates a thread, adds messages, and retrieves history", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Villas in Ischia",
    })) as Record<string, unknown>;
    expect(thread.id).toBe(1);

    await router.handle(db, "research.messages.create", {
      threadId: 1,
      role: "user",
      content: "Find me villas in Ischia for 80 guests",
    });

    await router.handle(db, "research.messages.create", {
      threadId: 1,
      role: "assistant",
      content: "I found 2 villas in Ischia.",
      toolCalls: JSON.stringify([
        { toolName: "search", args: { query: "villas Ischia" }, result: [] },
      ]),
      vendorIds: JSON.stringify([1, 2]),
    });

    const messages = (await router.handle(db, "research.messages.list", {
      threadId: 1,
    })) as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(JSON.parse(messages[1].toolCalls as string)).toHaveLength(1);
  });

  it("manages tool permissions end-to-end", async () => {
    const initial = await router.handle(db, "tools.permissions.get", { toolName: "search" });
    expect(initial).toBeNull();

    await router.handle(db, "tools.permissions.update", {
      toolName: "search",
      decision: "allow",
    });

    const after = (await router.handle(db, "tools.permissions.get", {
      toolName: "search",
    })) as Record<string, unknown>;
    expect(after.decision).toBe("allow");

    await router.handle(db, "tools.permissions.update", {
      toolName: "search",
      decision: "prompt",
    });

    const revoked = (await router.handle(db, "tools.permissions.get", {
      toolName: "search",
    })) as Record<string, unknown>;
    expect(revoked.decision).toBe("prompt");
  });

  it("thread deletion cascades messages", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Test",
    })) as Record<string, unknown>;

    await router.handle(db, "research.messages.create", {
      threadId: thread.id,
      role: "user",
      content: "Test message",
    });

    await router.handle(db, "research.threads.delete", { id: thread.id });

    const threads = (await router.handle(db, "research.threads.list", {})) as unknown[];
    expect(threads).toHaveLength(0);
  });

  it("updates thread title and category tags", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Initial",
    })) as Record<string, unknown>;

    const updated = (await router.handle(db, "research.threads.update", {
      id: thread.id,
      title: "Updated",
      categoryTags: JSON.stringify(["Venue/Food/Beverage"]),
    })) as Record<string, unknown>;

    expect(updated.title).toBe("Updated");
    expect(updated.categoryTags).toBe(JSON.stringify(["Venue/Food/Beverage"]));
  });
});
