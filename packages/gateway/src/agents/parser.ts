import { eq, sql } from "drizzle-orm";
import { communications, quotes, quoteLineItems, vendors } from "../db/schema.js";
import type { BaseAgent, AgentContext, AgentResult } from "./base-agent.js";

export const parserAgent: BaseAgent = {
  name: "parse",

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { communicationId } = input as { communicationId: number };

    ctx.emit("starting", "Parsing incoming message");

    const [comm] = await ctx.db
      .select()
      .from(communications)
      .where(eq(communications.id, communicationId));
    if (!comm) throw new Error(`Communication ${communicationId} not found`);

    const [vendor] = await ctx.db
      .select()
      .from(vendors)
      .where(eq(vendors.id, comm.vendorId));

    ctx.emit("analyzing", `Analyzing message from ${vendor?.name ?? "vendor"}`);

    const { generateText } = await import("ai");
    const { getModel } = await import("./model-provider.js");
    const model = await getModel();

    const { text: analysis } = await generateText({
      model,
      system: `You are analyzing a vendor response for a wedding planning app.
Extract structured data from the message. Return a JSON object with:
{
  "summary": "brief summary of the response",
  "pricing": [{ "description": "item", "amount": number, "currency": "EUR", "pricingType": "flat|per_person|per_unit|per_hour" }],
  "availability": "any dates/availability mentioned",
  "conditions": "any conditions, minimums, or requirements",
  "needsTranslation": false,
  "language": "detected language code"
}
Return ONLY valid JSON.`,
      prompt: `Vendor: ${vendor?.name ?? "Unknown"}\nSubject: ${comm.subject ?? ""}\n\nMessage:\n${comm.bodyOriginal}`,
      abortSignal: ctx.signal,
    });

    let parsed: {
      summary?: string;
      pricing?: Array<{
        description: string;
        amount: number;
        currency?: string;
        pricingType?: string;
      }>;
      availability?: string;
      conditions?: string;
    } = {};

    try {
      parsed = JSON.parse(analysis);
    } catch {
      ctx.emit("warning", "Could not parse structured data from response");
    }

    // Create quote if pricing found
    if (parsed.pricing && parsed.pricing.length > 0 && comm.vendorId) {
      const totalAmount = parsed.pricing.reduce((sum, p) => sum + (p.amount ?? 0), 0);

      const [quote] = await ctx.db
        .insert(quotes)
        .values({
          vendorId: comm.vendorId,
          totalAmount,
          currency: parsed.pricing[0]?.currency ?? "EUR",
          source: comm.channel,
        })
        .returning();

      if (parsed.pricing.length > 0) {
        await ctx.db.insert(quoteLineItems).values(
          parsed.pricing.map((p) => ({
            quoteId: quote.id,
            description: p.description,
            amount: p.amount,
            pricingType: p.pricingType ?? "flat",
          })),
        );
      }

      ctx.emit("found", `Created quote for ${totalAmount} ${parsed.pricing[0]?.currency ?? "EUR"}`);
    }

    // Update communication status
    await ctx.db
      .update(communications)
      .set({ status: "received", parsedAt: sql`datetime('now')` })
      .where(eq(communications.id, communicationId));

    ctx.emit("complete", "Message parsed successfully");

    return {
      summary: parsed.summary ?? "Message analyzed",
      data: parsed,
    };
  },
};

export const mockParserAgent: BaseAgent = {
  name: "parse",

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { communicationId } = input as { communicationId: number };

    ctx.emit("starting", "Parsing incoming message");
    ctx.emit("analyzing", "Analyzing message content");
    ctx.emit("complete", "Message parsed");

    return {
      summary: "Message analyzed (mock)",
      data: { communicationId, pricing: [], availability: null },
    };
  },
};
