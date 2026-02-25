import type { Db } from "../infra/router.js";

export interface AgentContext {
  db: Db;
  sessionKey: string;
  emit: (action: string, detail?: string) => void;
  signal: AbortSignal;
}

export interface AgentResult {
  summary: string;
  data?: unknown;
}

export interface BaseAgent {
  readonly name: string;
  run(ctx: AgentContext, input: unknown): Promise<AgentResult>;
}
