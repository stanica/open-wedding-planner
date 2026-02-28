import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { vendors, communications } from "../db/schema.js";
import type { Db } from "../infra/router.js";

export interface SendWhatsAppContext {
  db: Db;
  emit: (action: string, detail?: string) => void;
  getAutoSend: () => boolean;
  enqueue: (channel: "whatsapp", vendorId: number, payload: unknown) => void;
}

export function makeSendWhatsAppTool(ctx: SendWhatsAppContext) {
  return tool({
    description:
      "Send a WhatsApp message to a vendor. Looks up the vendor's WhatsApp number and either sends immediately (if auto-send is on) or creates a draft for user review.",
    inputSchema: z.object({
      vendorId: z.number().describe("The vendor ID to message"),
      message: z.string().describe("The message text to send"),
    }),
    execute: async ({ vendorId, message }) => {
      // Look up vendor
      const [vendor] = await ctx.db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId));
      if (!vendor) return { error: "Vendor not found" };
      if (!vendor.contactWhatsapp)
        return { error: "Vendor has no WhatsApp number" };

      const autoSend = ctx.getAutoSend();
      const status = autoSend ? "approved" : "draft";

      // Create communication record
      const [comm] = await ctx.db
        .insert(communications)
        .values({
          vendorId,
          direction: "out",
          channel: "whatsapp",
          bodyOriginal: message,
          status,
        })
        .returning();

      ctx.emit(
        autoSend ? "send-whatsapp" : "draft-ready",
        `${autoSend ? "Queued" : "Drafted"} WhatsApp message to ${vendor.name}`,
      );

      // If auto-send, enqueue for delivery
      if (autoSend) {
        ctx.enqueue("whatsapp", vendorId, {
          communicationId: comm.id,
          to: vendor.contactWhatsapp,
          text: message,
        });
      }

      return {
        communicationId: comm.id,
        status,
        vendorName: vendor.name,
        message: autoSend
          ? "Message queued for delivery"
          : "Message saved as draft for user review",
      };
    },
  });
}
