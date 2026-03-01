import { describe, it, expect, beforeEach, vi } from "vitest";
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

  describe("vapi.approveDraft", () => {
    it("updates draft status to queued", async () => {
      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "draft",
        instructions: "Ask about pricing",
      });

      const result = (await router.handle(db, "vapi.approveDraft", {
        id: 1,
      })) as any;
      expect(result.status).toBe("queued");
    });
  });

  describe("vapi.rejectDraft", () => {
    it("deletes the draft call", async () => {
      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "draft",
        instructions: "Ask about pricing",
      });

      await router.handle(db, "vapi.rejectDraft", { id: 1 });
      const calls = (await router.handle(
        db,
        "vapi.listCalls",
        {},
      )) as any[];
      expect(calls).toHaveLength(0);
    });
  });

  describe("vapi.approveDraft with VAPI channel", () => {
    it("initiates VAPI call when approving draft", async () => {
      const mockCreateCall = vi
        .fn()
        .mockResolvedValue({ id: "vapi-call-123", status: "queued" });
      const mockBroadcast = vi.fn();

      const routerWithDeps = new Router();
      registerVapiHandlers(routerWithDeps, {
        vapiChannel: { createCall: mockCreateCall } as any,
        getVapiConfig: () => ({ phoneNumberId: "pn-1", assistantId: "asst-1" }),
        broadcast: mockBroadcast,
      });

      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "draft",
        instructions: "Ask about pricing",
      });

      const result = (await routerWithDeps.handle(db, "vapi.approveDraft", {
        id: 1,
      })) as any;
      expect(mockCreateCall).toHaveBeenCalledWith(
        expect.objectContaining({ customerNumber: "+15551234567" }),
      );
      expect(result.vapiCallId).toBe("vapi-call-123");
      expect(mockBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "voice-call-status",
          data: { callId: 1, status: "queued" },
        }),
      );
    });

    it("sets status to failed when VAPI call throws", async () => {
      const mockCreateCall = vi
        .fn()
        .mockRejectedValue(new Error("VAPI API error 401: Unauthorized"));
      const routerWithDeps = new Router();
      registerVapiHandlers(routerWithDeps, {
        vapiChannel: { createCall: mockCreateCall } as any,
        getVapiConfig: () => ({ phoneNumberId: "pn-1", assistantId: "asst-1" }),
      });

      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "draft",
        instructions: "Ask about pricing",
      });

      const result = (await routerWithDeps.handle(db, "vapi.approveDraft", {
        id: 1,
      })) as any;
      expect(result.status).toBe("failed");
      expect(result.endedReason).toBe("VAPI API error 401: Unauthorized");
    });

    it("falls back to queued when no VAPI deps provided", async () => {
      // Uses the default router without deps (from beforeEach)
      await db.insert(schema.voiceCalls).values({
        vendorId: 1,
        phoneNumber: "+15551234567",
        status: "draft",
        instructions: "Ask about pricing",
      });

      const result = (await router.handle(db, "vapi.approveDraft", {
        id: 1,
      })) as any;
      expect(result.status).toBe("queued");
    });
  });
});
