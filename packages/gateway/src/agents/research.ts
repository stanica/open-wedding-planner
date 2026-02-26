import { generateText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { vendors, categories } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { BaseAgent, AgentContext, AgentResult } from "./base-agent.js";
import { getModel } from "./model-provider.js";
import { wrapToolWithPermission } from "../tools/permission-wrapper.js";

function makeCreateVendorTool(ctx: AgentContext) {
  return tool({
    description:
      "Create a new vendor record in the database. Use this after gathering sufficient information about a vendor. Avoid creating duplicates.",
    inputSchema: z.object({
      name: z.string().describe("The vendor's business name"),
      categoryName: z
        .string()
        .describe(
          "Category: Venue/Food/Beverage, Ceremony, Photography/Videography, Decor, Stationery, Attire, Entertainment, Planner/Coordinator, Miscellaneous, or Contingency",
        ),
      location: z.string().nullable().describe("Vendor location"),
      websiteUrl: z.string().nullable().describe("Vendor website URL"),
      contactEmail: z.string().nullable().describe("Contact email"),
      contactPhone: z.string().nullable().describe("Contact phone number"),
      description: z
        .string()
        .nullable()
        .describe("Brief description of services and what was found"),
      imageUrl: z
        .string()
        .nullable()
        .describe("URL of a representative image (e.g. from og:image meta tag)"),
    }),
    execute: async (params) => {
      ctx.emit("creating-vendor", `Adding vendor: ${params.name}`);

      const [cat] = await ctx.db
        .select()
        .from(categories)
        .where(eq(categories.name, params.categoryName));
      const categoryId = cat?.id ?? 9;

      const [vendor] = await ctx.db
        .insert(vendors)
        .values({
          categoryId,
          name: params.name,
          location: params.location,
          websiteUrl: params.websiteUrl,
          contactEmail: params.contactEmail,
          contactPhone: params.contactPhone,
          description: params.description,
          imageUrl: params.imageUrl,
          status: "researched",
        })
        .returning();

      return { vendorId: vendor.id, name: vendor.name };
    },
  });
}

const SYSTEM_PROMPT = `You are a wedding vendor research assistant. Your job is to find and document wedding vendors matching the user's queries.

## Process
1. Search the web for vendors matching the query
2. For promising results, scrape or browse the page to get details
3. Extract: business name, location, contact info, services offered, pricing hints
4. Create vendor records for each viable option found

## Guidelines
- Focus on quality over quantity — 2-5 well-researched vendors is better than 10 stubs
- Extract real contact information when available (email, phone, website)
- Write clear descriptions summarizing what the vendor offers
- Pick the most appropriate category for each vendor
- When scraping a vendor's website, note the image URL from the scrape results (meta.imageUrl) and pass it to createVendor
- If a page is JavaScript-heavy and the scraper returns little content, try the browser tool
- If you find a PDF (menu, brochure, price list), parse it for details
- Do not create duplicate vendors
- When comparing vendors, always lead with pricing information — it's the #1 thing users care about
- After finding multiple vendors, provide a brief comparison summary highlighting key differences

## Categories
Venue/Food/Beverage, Ceremony, Photography/Videography, Decor, Stationery, Attire, Entertainment, Planner/Coordinator, Miscellaneous, Contingency`;

const RESEARCH_TOOLS = ["search", "scrape", "browse", "parsePdf"];

export const researchAgent: BaseAgent = {
  name: "research",
  tools: RESEARCH_TOOLS,

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { messages } = input as { messages: ModelMessage[] };
    ctx.emit("starting", "Researching...");

    // Build tool set: static tools from registry + dynamic createVendor
    const staticTools = ctx.toolRegistry.getToolSet(RESEARCH_TOOLS);
    const createVendorTool = makeCreateVendorTool(ctx);

    // Wrap all tools with permission checks
    const tools: Record<string, any> = {};
    for (const [name, t] of Object.entries(staticTools)) {
      tools[name] = wrapToolWithPermission(t, name, ctx.permissionManager, ctx.permissionCallbacks);
    }
    tools.createVendor = wrapToolWithPermission(
      createVendorTool,
      "createVendor",
      ctx.permissionManager,
      ctx.permissionCallbacks,
    );

    const model = await getModel();
    const { text, steps } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(15),
      abortSignal: ctx.signal,
      onStepFinish: ({ toolCalls: stepTools }) => {
        for (const tc of stepTools) {
          ctx.emit("tool-call", `${tc.toolName}: ${JSON.stringify(tc.input).slice(0, 100)}`);
        }
      },
    });

    // Collect all tool calls and vendor IDs from steps
    const allToolCalls: Array<{ toolName: string; args: unknown; result: unknown }> = [];
    const vendorIds: number[] = [];
    for (const step of steps) {
      for (const tc of step.toolCalls) {
        // Find matching result
        const tr = step.toolResults.find(
          (r: any) => r.toolCallId === tc.toolCallId,
        );
        allToolCalls.push({ toolName: tc.toolName, args: tc.input, result: tr?.output });
        if (tc.toolName === "createVendor" && tr?.output && typeof tr.output === "object") {
          const r = tr.output as { vendorId?: number };
          if (r.vendorId) vendorIds.push(r.vendorId);
        }
      }
    }

    const vendorsCreated = vendorIds.length;
    ctx.emit("complete", `Created ${vendorsCreated} vendors`);

    return {
      summary: text ?? `Created ${vendorsCreated} vendor(s)`,
      data: { vendorsCreated, vendorIds, toolCalls: allToolCalls },
    };
  },
};
