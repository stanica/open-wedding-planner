import { tool as createTool } from "ai";
import type { Tool } from "ai";
import { eq, sql } from "drizzle-orm";
import { toolPermissions } from "../db/schema.js";
import type { Db } from "../infra/router.js";

export type PermissionDecision = "allow" | "deny" | "prompt";
export type UserResponse = "allow" | "always-allow" | "deny";

export interface PermissionCallbacks {
  requestPermission: (toolName: string, context?: string) => Promise<UserResponse>;
}

export class PermissionManager {
  private cache = new Map<string, PermissionDecision>();

  constructor(private db: Db) {}

  async getDecision(toolName: string): Promise<PermissionDecision> {
    if (this.cache.has(toolName)) return this.cache.get(toolName)!;
    const [row] = await this.db
      .select()
      .from(toolPermissions)
      .where(eq(toolPermissions.toolName, toolName));
    const decision = (row?.decision as PermissionDecision) ?? "prompt";
    this.cache.set(toolName, decision);
    return decision;
  }

  async setDecision(toolName: string, decision: PermissionDecision): Promise<void> {
    await this.db
      .insert(toolPermissions)
      .values({ toolName, decision, updatedAt: sql`datetime('now')` })
      .onConflictDoUpdate({
        target: toolPermissions.toolName,
        set: { decision, updatedAt: sql`datetime('now')` },
      });
    this.cache.set(toolName, decision);
  }

  allowOnce(toolName: string): void {
    this.cache.set(toolName, "allow");
  }
}

export function wrapToolWithPermission(
  originalTool: Tool,
  toolName: string,
  manager: PermissionManager,
  callbacks: PermissionCallbacks,
): Tool {
  const orig = originalTool as any;
  return createTool({
    description: orig.description ?? "",
    inputSchema: orig.inputSchema ?? orig.parameters,
    execute: async (params: any, context: any) => {
      const decision = await manager.getDecision(toolName);

      if (decision === "allow") {
        return orig.execute!(params, context);
      }

      if (decision === "deny") {
        return { error: `Tool "${toolName}" is not permitted. Try an alternative approach.` };
      }

      // decision === "prompt"
      const response = await callbacks.requestPermission(toolName, undefined);

      if (response === "always-allow") {
        await manager.setDecision(toolName, "allow");
        return orig.execute!(params, context);
      }

      if (response === "allow") {
        manager.allowOnce(toolName);
        return orig.execute!(params, context);
      }

      // response === "deny"
      return { error: `Tool "${toolName}" is not permitted. Try an alternative approach.` };
    },
  });
}
