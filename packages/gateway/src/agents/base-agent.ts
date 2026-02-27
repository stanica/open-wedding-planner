import type { Tool } from "ai";
import type { Db } from "../infra/router.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { PermissionManager, PermissionCallbacks } from "../tools/permission-wrapper.js";
import type { Guardrails } from "./safety/guardrails.js";
import type { GuardrailsConfig } from "./safety/types.js";

export interface AgentContext {
  db: Db;
  sessionKey: string;
  emit: (action: string, detail?: string) => void;
  signal: AbortSignal;
  toolRegistry: ToolRegistry;
  permissionManager: PermissionManager;
  permissionCallbacks: PermissionCallbacks;
  guardrails: Guardrails;
}

export interface AgentResult {
  summary: string;
  data?: unknown;
  compactionSummary?: string;
}

export interface BaseAgent {
  readonly name: string;
  readonly tools?: string[];
  run(ctx: AgentContext, input: unknown): Promise<AgentResult>;
}

export interface TaskConfig {
  name: string;
  systemPrompt: string;
  tools: string[];
  maxSteps?: number;
  guardrails?: Partial<GuardrailsConfig>;
  setup?: (toolCtx: unknown) => Promise<{
    extraTools: Record<string, Tool>;
    cleanup: () => Promise<void>;
  }>;
}
