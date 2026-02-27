import { tool } from "ai";
import { z } from "zod";
import type { Orchestrator } from "../agents/orchestrator.js";

export interface DispatchContext {
  orchestrator: Orchestrator;
  parentSessionKey: string;
}

export function makeDispatchTool(ctx: DispatchContext) {
  return tool({
    description:
      "Dispatch a browser subagent to navigate and research a website. The subagent gets full browser control (click, type, scroll, screenshot) and can save vendor data directly. Returns a taskId — use awaitTasks to collect results later. You can dispatch multiple subagents in parallel.",
    inputSchema: z.object({
      url: z.string().url().describe("The website URL to research"),
      instructions: z
        .string()
        .describe("What to find on the website (e.g. 'Find pricing, gallery images, and contact info')"),
      vendorId: z
        .number()
        .optional()
        .describe("Vendor ID to associate data with. The subagent can use this to save images and update vendor info."),
    }),
    execute: async ({ url, instructions, vendorId }) => {
      const { taskId } = await ctx.orchestrator.dispatch(
        "browser",
        { url, instructions, vendorId },
        { lane: "subagent", vendorId },
      );
      return { taskId };
    },
  });
}
