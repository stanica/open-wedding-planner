import type { Db } from "../infra/router.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { PermissionManager, PermissionCallbacks } from "../tools/permission-wrapper.js";

export interface AgentContext {
  db: Db;
  sessionKey: string;
  emit: (action: string, detail?: string) => void;
  signal: AbortSignal;
  toolRegistry: ToolRegistry;
  permissionManager: PermissionManager;
  permissionCallbacks: PermissionCallbacks;
}

export interface AgentResult {
  summary: string;
  data?: unknown;
}

export interface BaseAgent {
  readonly name: string;
  readonly tools?: string[];
  run(ctx: AgentContext, input: unknown): Promise<AgentResult>;
}
