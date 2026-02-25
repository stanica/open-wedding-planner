import { eq } from "drizzle-orm";
import { vendors, weddingConfig, communications } from "../db/schema.js";
import type { BaseAgent, AgentContext, AgentResult } from "./base-agent.js";

export const outreachAgent: BaseAgent = {
  name: "outreach",

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { vendorId, channel, customInstructions } = input as {
      vendorId: number;
      channel: "email" | "whatsapp";
      customInstructions?: string;
    };

    ctx.emit("starting", "Preparing outreach message");

    // Load vendor and config
    const [vendor] = await ctx.db.select().from(vendors).where(eq(vendors.id, vendorId));
    if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

    const [config] = await ctx.db.select().from(weddingConfig);
    const languagePrefs: string[] = config?.languagePreferences
      ? JSON.parse(config.languagePreferences)
      : ["en"];

    ctx.emit("drafting", `Drafting message to ${vendor.name}`);

    const { generateText } = await import("ai");
    const { getModel } = await import("./model-provider.js");

    const targetLang = languagePrefs.find((l) => l !== "en") ?? "en";
    const model = await getModel();

    const { text: draft } = await generateText({
      model,
      system: `You are drafting a ${channel === "email" ? "professional email" : "WhatsApp message"} to a wedding vendor.
Write in ${targetLang === "en" ? "English" : `${targetLang} (with English being the couple's native language)`}.
Be warm but professional. Include relevant wedding details.
${customInstructions ? `Additional instructions: ${customInstructions}` : ""}`,
      prompt: `Draft a message to ${vendor.name} (${vendor.description ?? "wedding vendor"}) in ${vendor.location ?? "unknown location"}.
Couple: ${config?.coupleNames ?? "the couple"}
Wedding date: ${config?.weddingDate ?? "TBD"}
Guest count: ${config?.guestCount ?? "TBD"}
Budget context: ${config?.totalBudget ? `Total budget ${config.totalBudget} ${config.currency ?? "EUR"}` : "Not specified"}`,
      abortSignal: ctx.signal,
    });

    // Create communication record
    const [comm] = await ctx.db
      .insert(communications)
      .values({
        vendorId,
        direction: "out",
        channel,
        subject: `Inquiry to ${vendor.name}`,
        bodyOriginal: draft,
        status: "draft",
      })
      .returning();

    ctx.emit("complete", `Draft created for ${vendor.name}`);

    // Broadcast draft-ready event
    ctx.emit("draft-ready", `Draft ready for review: ${vendor.name}`);

    return {
      summary: `Draft ${channel} message created for ${vendor.name}`,
      data: { communicationId: comm.id, vendorId, draft },
    };
  },
};

export const mockOutreachAgent: BaseAgent = {
  name: "outreach",

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { vendorId, channel } = input as {
      vendorId: number;
      channel: "email" | "whatsapp";
    };

    const [vendor] = await ctx.db.select().from(vendors).where(eq(vendors.id, vendorId));
    if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

    ctx.emit("starting", "Preparing outreach message");
    ctx.emit("drafting", `Drafting message to ${vendor.name}`);

    const draft = `Dear ${vendor.name},\n\nWe are interested in your services for our wedding. Could you provide pricing details?\n\nBest regards`;

    const [comm] = await ctx.db
      .insert(communications)
      .values({
        vendorId,
        direction: "out",
        channel,
        subject: `Inquiry to ${vendor.name}`,
        bodyOriginal: draft,
        status: "draft",
      })
      .returning();

    ctx.emit("complete", `Draft created for ${vendor.name}`);

    return {
      summary: `Draft ${channel} message created for ${vendor.name}`,
      data: { communicationId: comm.id, vendorId, draft },
    };
  },
};
