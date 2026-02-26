import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerResearchThreadHandlers } from "../../src/handlers/research-threads.js";

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  registerResearchThreadHandlers(router);
  return { db, router };
}

describe("research thread handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;

  beforeEach(() => {
    ({ db, router } = setup());
  });

  it("creates a thread", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Villas in Ischia",
    })) as Record<string, unknown>;
    expect(thread.id).toBe(1);
    expect(thread.title).toBe("Villas in Ischia");
  });

  it("lists threads sorted by updatedAt desc", async () => {
    await router.handle(db, "research.threads.create", { title: "Thread 1" });
    await router.handle(db, "research.threads.create", { title: "Thread 2" });
    const list = (await router.handle(db, "research.threads.list", {})) as unknown[];
    expect(list).toHaveLength(2);
  });

  it("deletes a thread and its messages", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Thread 1",
    })) as Record<string, unknown>;
    await router.handle(db, "research.messages.create", {
      threadId: thread.id,
      role: "user",
      content: "Hello",
    });
    await router.handle(db, "research.threads.delete", { id: thread.id });
    const list = (await router.handle(db, "research.threads.list", {})) as unknown[];
    expect(list).toHaveLength(0);
  });

  it("creates and lists messages for a thread", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Test",
    })) as Record<string, unknown>;
    await router.handle(db, "research.messages.create", {
      threadId: thread.id,
      role: "user",
      content: "Find villas",
    });
    await router.handle(db, "research.messages.create", {
      threadId: thread.id,
      role: "assistant",
      content: "I found 3 villas.",
      toolCalls: JSON.stringify([{ toolName: "search", args: {}, result: {} }]),
      vendorIds: JSON.stringify([1, 2]),
    });
    const messages = (await router.handle(db, "research.messages.list", {
      threadId: thread.id,
    })) as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(JSON.parse(messages[1].toolCalls as string)).toHaveLength(1);
  });

  it("updates thread title and categoryTags", async () => {
    const thread = (await router.handle(db, "research.threads.create", {
      title: "Initial",
    })) as Record<string, unknown>;
    const updated = (await router.handle(db, "research.threads.update", {
      id: thread.id,
      title: "Updated Title",
      categoryTags: JSON.stringify(["Venue/Food/Beverage"]),
    })) as Record<string, unknown>;
    expect(updated.title).toBe("Updated Title");
    expect(updated.categoryTags).toBe(JSON.stringify(["Venue/Food/Beverage"]));
  });
});
