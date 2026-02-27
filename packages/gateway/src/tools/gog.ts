import { tool } from "ai";
import { z } from "zod";
import type { GogManager } from "../infra/gog-manager.js";
import type { PermissionCallbacks } from "./permission-wrapper.js";

const WRITE_KEYWORDS = ["send", "create", "delete", "update", "modify", "trash", "remove", "insert", "patch"];

export function isGogReadCommand(subcommand: string, args: string[]): boolean {
  const allArgs = [subcommand, ...args].join(" ").toLowerCase();
  return !WRITE_KEYWORDS.some((kw) => allArgs.includes(kw));
}

export interface GogToolContext {
  gogManager: GogManager;
  accountEmail: string;
  services: string;
  getAutoSend: () => boolean;
  permissionCallbacks: PermissionCallbacks;
}

export function makeGogTool(ctx: GogToolContext) {
  const serviceList = ctx.services.split(",").map((s) => s.trim()).join(", ");

  return tool({
    description: `Run gog CLI commands for Google services. Connected account: ${ctx.accountEmail}. Available services: ${serviceList}. Output is JSON. Use subcommands like "gmail" (search, send, threads, labels), "cal" (events list/create), "contacts" (list/get), "drive" (list/get/upload). Read operations are auto-approved; write operations (send, create, delete) may require user approval.`,
    inputSchema: z.object({
      subcommand: z
        .string()
        .describe('The gog service subcommand (e.g. "gmail", "cal", "contacts", "drive")'),
      args: z
        .array(z.string())
        .describe('Arguments for the subcommand (e.g. ["search", "is:unread newer_than:1d", "--max", "10"])'),
    }),
    execute: async ({ subcommand, args }) => {
      const isRead = isGogReadCommand(subcommand, args);

      // Write commands need approval unless auto-send is on
      if (!isRead && !ctx.getAutoSend()) {
        const fullCmd = `gog ${subcommand} ${args.join(" ")}`;
        const response = await ctx.permissionCallbacks.requestPermission(
          `gog:${subcommand}:write`,
          fullCmd,
        );
        if (response === "deny") {
          return {
            error: "Write operation denied by user. Create a draft communication record instead.",
          };
        }
      }

      try {
        const fullArgs = [
          subcommand,
          ...args,
          "--json",
          "--account", ctx.accountEmail,
        ];
        const { stdout, stderr } = await ctx.gogManager.exec(fullArgs);

        // Try to parse JSON output
        try {
          return { data: JSON.parse(stdout) };
        } catch {
          return { output: stdout, stderr: stderr || undefined };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  });
}
