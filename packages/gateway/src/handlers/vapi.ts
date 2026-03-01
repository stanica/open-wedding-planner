import { eq, desc } from "drizzle-orm";
import { voiceCalls, vendors } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";
import type { VapiChannel } from "../channels/vapi.js";
import type { GatewayEvent } from "@wedding-planner/shared";

export interface VapiHandlerDeps {
  vapiChannel?: VapiChannel | null;
  getVapiConfig?: () => { phoneNumberId: string; assistantId: string } | null;
  broadcast?: (event: GatewayEvent) => void;
}

export function registerVapiHandlers(router: Router, deps?: VapiHandlerDeps) {
  router.register("vapi.listCalls", async (db: Db) => {
    const rows = await db
      .select({
        id: voiceCalls.id,
        vendorId: voiceCalls.vendorId,
        vendorName: vendors.name,
        vapiCallId: voiceCalls.vapiCallId,
        phoneNumber: voiceCalls.phoneNumber,
        assistantId: voiceCalls.assistantId,
        status: voiceCalls.status,
        endedReason: voiceCalls.endedReason,
        duration: voiceCalls.duration,
        summary: voiceCalls.summary,
        transcript: voiceCalls.transcript,
        recordingUrl: voiceCalls.recordingUrl,
        structuredData: voiceCalls.structuredData,
        instructions: voiceCalls.instructions,
        createdAt: voiceCalls.createdAt,
        endedAt: voiceCalls.endedAt,
      })
      .from(voiceCalls)
      .leftJoin(vendors, eq(voiceCalls.vendorId, vendors.id))
      .orderBy(desc(voiceCalls.id));

    return rows;
  });

  router.register("vapi.getCall", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [row] = await db
      .select({
        id: voiceCalls.id,
        vendorId: voiceCalls.vendorId,
        vendorName: vendors.name,
        vapiCallId: voiceCalls.vapiCallId,
        phoneNumber: voiceCalls.phoneNumber,
        assistantId: voiceCalls.assistantId,
        status: voiceCalls.status,
        endedReason: voiceCalls.endedReason,
        duration: voiceCalls.duration,
        summary: voiceCalls.summary,
        transcript: voiceCalls.transcript,
        recordingUrl: voiceCalls.recordingUrl,
        structuredData: voiceCalls.structuredData,
        instructions: voiceCalls.instructions,
        createdAt: voiceCalls.createdAt,
        endedAt: voiceCalls.endedAt,
      })
      .from(voiceCalls)
      .leftJoin(vendors, eq(voiceCalls.vendorId, vendors.id))
      .where(eq(voiceCalls.id, id));

    if (!row) throw new Error(`Voice call ${id} not found`);
    return row;
  });

  router.register("vapi.approveDraft", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [call] = await db.select().from(voiceCalls).where(eq(voiceCalls.id, id));
    if (!call) throw new Error(`Voice call ${id} not found`);

    await db.update(voiceCalls).set({ status: "queued" }).where(eq(voiceCalls.id, id));

    // Attempt to place the call via VAPI
    if (deps?.vapiChannel && deps?.getVapiConfig) {
      const config = deps.getVapiConfig();
      if (config) {
        try {
          const result = await deps.vapiChannel.createCall({
            phoneNumberId: config.phoneNumberId,
            assistantId: config.assistantId,
            customerNumber: call.phoneNumber,
          });
          await db
            .update(voiceCalls)
            .set({ vapiCallId: result.id, status: result.status })
            .where(eq(voiceCalls.id, id));

          deps.broadcast?.({
            name: "voice-call-status",
            data: { callId: id, status: result.status },
          });
        } catch (err) {
          await db
            .update(voiceCalls)
            .set({ status: "failed", endedReason: (err as Error).message })
            .where(eq(voiceCalls.id, id));
        }
      }
    }

    const [updated] = await db.select().from(voiceCalls).where(eq(voiceCalls.id, id));
    return updated;
  });

  router.register("vapi.rejectDraft", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(voiceCalls).where(eq(voiceCalls.id, id));
    return { ok: true };
  });
}
