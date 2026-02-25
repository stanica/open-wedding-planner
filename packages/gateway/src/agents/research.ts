import { generateText, tool } from "ai";
import { z } from "zod";
import { vendors, categories } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { searchTool } from "../tools/search.js";
import { scraperTool } from "../tools/scraper.js";
import { browserTool } from "../tools/browser.js";
import { pdfTool } from "../tools/pdf.js";
import type { BaseAgent, AgentContext, AgentResult } from "./base-agent.js";

interface CreateVendorParams {
  name: string;
  categoryName: string;
  location: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  description: string | null;
}

function makeCreateVendorTool(ctx: AgentContext) {
  return tool({
    description:
      "Create a new vendor record in the database. Use this after gathering sufficient information about a vendor. Avoid creating duplicates.",
    parameters: z.object({
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
    }),
    execute: async (params: CreateVendorParams) => {
      ctx.emit("creating-vendor", `Adding vendor: ${params.name}`);

      // Look up category
      const [cat] = await ctx.db
        .select()
        .from(categories)
        .where(eq(categories.name, params.categoryName));
      const categoryId = cat?.id ?? 9; // Miscellaneous fallback

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
          status: "researched",
        })
        .returning();

      return { vendorId: vendor.id, name: vendor.name };
    },
  });
}

const SYSTEM_PROMPT = `You are a wedding vendor research assistant. Your job is to find and document wedding vendors matching the user's query.

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
- If a page is JavaScript-heavy and the scraper returns little content, try the browser tool
- If you find a PDF (menu, brochure, price list), parse it for details
- Do not create duplicate vendors

## Categories
Venue/Food/Beverage, Ceremony, Photography/Videography, Decor, Stationery, Attire, Entertainment, Planner/Coordinator, Miscellaneous, Contingency`;

export const researchAgent: BaseAgent = {
  name: "research",

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { query } = input as { query: string };
    ctx.emit("starting", `Researching: ${query}`);

    const createVendorTool = makeCreateVendorTool(ctx);

    const { text, toolCalls } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      prompt: query,
      tools: {
        search: searchTool,
        scrape: scraperTool,
        browse: browserTool,
        parsePdf: pdfTool,
        createVendor: createVendorTool,
      },
      maxSteps: 15,
      abortSignal: ctx.signal,
      onStepFinish: ({ toolCalls: stepTools }) => {
        for (const tc of stepTools) {
          ctx.emit("tool-call", `${tc.toolName}: ${JSON.stringify(tc.args).slice(0, 100)}`);
        }
      },
    });

    const vendorsCreated = toolCalls.filter((tc) => tc.toolName === "createVendor").length;

    ctx.emit("complete", `Created ${vendorsCreated} vendors`);

    return {
      summary:
        vendorsCreated > 0
          ? `Found and added ${vendorsCreated} vendor${vendorsCreated !== 1 ? "s" : ""} for "${query}"`
          : `Research complete for "${query}" — ${text?.slice(0, 200) ?? "no results"}`,
      data: { vendorsCreated },
    };
  },
};

// Also export mock for testing without API keys
export const mockResearchAgent: BaseAgent = {
  name: "research",

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { query } = input as { query: string };

    ctx.emit("starting", `Researching: ${query}`);
    await delay(300, ctx.signal);
    ctx.emit("searching", `Searching web for "${query}"`);
    await delay(300, ctx.signal);
    ctx.emit("found", "Found 2 potential vendors");

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
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      },
      { once: true },
    );
  });
}

function getModel() {
  // Dynamic import to allow configuration
  const { anthropic } = require("@ai-sdk/anthropic") as typeof import("@ai-sdk/anthropic");
  return anthropic("claude-sonnet-4-20250514");
}
