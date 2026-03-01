import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { vendors, voiceCalls, weddingConfig } from "../db/schema.js";
import type { Db } from "../infra/router.js";
import type { CreateCallParams, VapiCallDetail } from "../channels/vapi.js";

export interface VapiCallContext {
  db: Db;
  emit: (action: string, detail?: string) => void;
  createCall: (params: CreateCallParams) => Promise<{ id: string; status: string }>;
  getCall: (callId: string) => Promise<VapiCallDetail>;
  getVapiConfig: () => { phoneNumberId: string; assistantId: string } | null;
  broadcast?: (event: { name: string; data: unknown }) => void;
}

const POLL_INTERVAL = 5_000;
const MAX_POLL_TIME = 10 * 60_000; // 10 minutes

function pollCallStatus(ctx: VapiCallContext, callId: number, vapiCallId: string) {
  const start = Date.now();

  const timer = setInterval(async () => {
    if (Date.now() - start > MAX_POLL_TIME) {
      clearInterval(timer);
      return;
    }

    try {
      const detail = await ctx.getCall(vapiCallId);

      // Update status if changed
      const [current] = await ctx.db
        .select({ status: voiceCalls.status })
        .from(voiceCalls)
        .where(eq(voiceCalls.id, callId));

      if (!current || current.status === "ended" || current.status === "failed") {
        clearInterval(timer);
        return;
      }

      if (detail.status !== current.status) {
        await ctx.db
          .update(voiceCalls)
          .set({ status: detail.status })
          .where(eq(voiceCalls.id, callId));
        ctx.broadcast?.({
          name: "voice-call-status",
          data: { callId, status: detail.status },
        });
      }

      if (detail.status === "ended") {
        clearInterval(timer);
        await ctx.db
          .update(voiceCalls)
          .set({
            status: "ended",
            endedReason: detail.endedReason,
            duration: detail.duration,
            summary: detail.analysis?.summary ?? undefined,
            transcript: detail.artifact?.transcript ?? undefined,
            recordingUrl: detail.artifact?.recordingUrl ?? undefined,
            structuredData: detail.analysis?.structuredData
              ? JSON.stringify(detail.analysis.structuredData)
              : undefined,
            endedAt: detail.endedAt ?? new Date().toISOString(),
          })
          .where(eq(voiceCalls.id, callId));
        ctx.broadcast?.({
          name: "voice-call-ended",
          data: { callId },
        });
      }
    } catch {
      // Silently retry on next interval
    }
  }, POLL_INTERVAL);
}

export function makeVapiCallTool(ctx: VapiCallContext) {
  return tool({
    description:
      "Initiate a voice call to a vendor via VAPI. Looks up the vendor's phone number and places the call immediately.",
    inputSchema: z.object({
      vendorId: z.number().optional().describe("The vendor ID to call"),
      phoneNumber: z.string().optional().describe("Phone number to dial (overrides vendor lookup)"),
      instructions: z.string().describe("Explicit instructions for the voice agent: what to ask, discuss, or negotiate with the vendor"),
      firstMessage: z.string().optional().describe("The opening message the voice agent says when the call connects. If not provided, a default greeting is used."),
    }),
    execute: async ({ vendorId, phoneNumber, instructions, firstMessage }) => {
      let resolvedPhone = phoneNumber;
      let resolvedVendorId = vendorId;
      let vendorName: string | undefined;

      if (vendorId && !resolvedPhone) {
        const [vendor] = await ctx.db
          .select()
          .from(vendors)
          .where(eq(vendors.id, vendorId));
        if (!vendor) return { error: "Vendor not found" };
        resolvedPhone = vendor.contactPhone ?? undefined;
        vendorName = vendor.name;
        if (!resolvedPhone) return { error: `Vendor "${vendor.name}" has no phone number` };
      }

      if (!resolvedPhone) return { error: "No phone number provided and no vendor specified" };

      const vapiConfig = ctx.getVapiConfig();
      if (!vapiConfig) return { error: "VAPI is not configured. Set API key, phone number ID, and assistant ID in Settings." };

      // Create voice call record
      const [call] = await ctx.db
        .insert(voiceCalls)
        .values({
          vendorId: resolvedVendorId ?? null,
          phoneNumber: resolvedPhone,
          assistantId: vapiConfig.assistantId,
          status: "queued",
          instructions,
        })
        .returning();

      ctx.emit(
        "vapi-call-initiated",
        `Initiating call to ${vendorName ?? resolvedPhone}`,
      );

      // Get couple names for system prompt
      const [weddingCfg] = await ctx.db.select().from(weddingConfig);
      const coupleNames = weddingCfg?.coupleNames ?? "the couple";

      const systemPrompt = `You are calling on behalf of ${coupleNames} as their wedding planner. ${instructions}`;

      try {
        const result = await ctx.createCall({
          phoneNumberId: vapiConfig.phoneNumberId,
          assistantId: vapiConfig.assistantId,
          customerNumber: resolvedPhone,
          assistantOverrides: {
            model: {
              provider: "xai",
              model: "grok-4-fast-non-reasoning",
              messages: [{ role: "system", content: systemPrompt }],
            },
            firstMessage: firstMessage ?? `Hi! I'm calling on behalf of ${coupleNames} who are planning their wedding. Do you have a moment to chat?`,
          },
        });

        await ctx.db
          .update(voiceCalls)
          .set({ vapiCallId: result.id, status: result.status })
          .where(eq(voiceCalls.id, call.id));

        // Start background polling for call status updates
        pollCallStatus(ctx, call.id, result.id);

        return {
          callId: call.id,
          vapiCallId: result.id,
          status: result.status,
          vendorName,
          message: `Call initiated to ${vendorName ?? resolvedPhone}`,
        };
      } catch (err) {
        await ctx.db
          .update(voiceCalls)
          .set({ status: "failed", endedReason: (err as Error).message })
          .where(eq(voiceCalls.id, call.id));

        return {
          callId: call.id,
          status: "failed",
          error: `Failed to initiate call: ${(err as Error).message}`,
        };
      }
    },
  });
}
