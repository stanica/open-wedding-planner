import { vendors } from "../db/schema.js";
import type { BaseAgent, AgentContext, AgentResult } from "./base-agent.js";

export const mockResearchAgent: BaseAgent = {
  name: "research",

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { query } = input as { query: string };

    ctx.emit("starting", `Researching: ${query}`);

    // Simulate search delay
    await delay(300, ctx.signal);
    ctx.emit("searching", `Searching web for "${query}"`);

    await delay(300, ctx.signal);
    ctx.emit("found", "Found 3 potential vendors");

    // Create mock vendors
    const mockVendors = [
      {
        categoryId: 1,
        name: `${query} - Villa Elegante`,
        location: "Ischia, Italy",
        status: "researched" as const,
        description: `Top-rated venue found while researching "${query}"`,
      },
      {
        categoryId: 1,
        name: `${query} - Garden Resort`,
        location: "Ischia, Italy",
        status: "researched" as const,
        description: `Alternative venue option for "${query}"`,
      },
    ];

    const created = [];
    for (const vendor of mockVendors) {
      ctx.emit("creating-vendor", `Adding vendor: ${vendor.name}`);
      const [row] = await ctx.db.insert(vendors).values(vendor).returning();
      created.push(row);
    }

    ctx.emit("complete", `Created ${created.length} vendors`);

    return {
      summary: `Found and added ${created.length} vendors for "${query}"`,
      data: { vendorIds: created.map((v) => v.id) },
    };
  },
};

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    }, { once: true });
  });
}
