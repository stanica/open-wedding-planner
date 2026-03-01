import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { vendors, voiceCalls } from "../db/schema.js";
import type { Db } from "../infra/router.js";
import type { CreateCallParams } from "../channels/vapi.js";

export interface VapiCallContext {
  db: Db;
  emit: (action: string, detail?: string) => void;
  getAutoCall: () => boolean;
  createCall: (params: CreateCallParams) => Promise<{ id: string; status: string }>;
  getVapiConfig: () => { phoneNumberId: string; assistantId: string } | null;
}

export function makeVapiCallTool(ctx: VapiCallContext) {
  return tool({
    description:
      "Initiate a voice call to a vendor. Looks up the vendor's phone number and either calls immediately (if auto-call is on) or creates a draft for user review.",
    inputSchema: z.object({
      vendorId: z.number().optional().describe("The vendor ID to call"),
      phoneNumber: z.string().optional().describe("Phone number to dial (overrides vendor lookup)"),
      instructions: z.string().describe("What the voice agent should discuss on the call"),
    }),
    execute: async ({ vendorId, phoneNumber, instructions }) => {
      let resolvedPhone = phoneNumber;
      let resolvedVendorId = vendorId;
      let vendorName: string | undefined;

      // Look up vendor phone if needed
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

      const autoCall = ctx.getAutoCall();
      const status = autoCall ? "queued" : "draft";

      // Create voice call record
      const [call] = await ctx.db
        .insert(voiceCalls)
        .values({
          vendorId: resolvedVendorId ?? null,
          phoneNumber: resolvedPhone,
          assistantId: vapiConfig.assistantId,
          status,
          instructions,
        })
        .returning();

      ctx.emit(
        autoCall ? "vapi-call-initiated" : "vapi-call-draft",
        `${autoCall ? "Initiating" : "Drafted"} call to ${vendorName ?? resolvedPhone}`,
      );

      // If auto-call, place the call via VAPI
      if (autoCall) {
        try {
          const result = await ctx.createCall({
            phoneNumberId: vapiConfig.phoneNumberId,
            assistantId: vapiConfig.assistantId,
            customerNumber: resolvedPhone,
          });

          await ctx.db
            .update(voiceCalls)
            .set({ vapiCallId: result.id, status: result.status })
            .where(eq(voiceCalls.id, call.id));

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
      }

      return {
        callId: call.id,
        status: "draft",
        vendorName,
        message: `Call draft created for ${vendorName ?? resolvedPhone}. Awaiting user approval.`,
      };
    },
  });
}
