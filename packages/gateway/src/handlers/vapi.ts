import { eq, desc } from "drizzle-orm";
import { voiceCalls, vendors } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerVapiHandlers(router: Router) {
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
}
