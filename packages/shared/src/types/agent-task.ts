import { z } from "zod";

export const AgentTaskType = z.enum(["research", "outreach", "translation", "parse"]);
export type AgentTaskType = z.infer<typeof AgentTaskType>;

export const AgentTaskStatus = z.enum(["pending", "running", "completed", "failed"]);
export type AgentTaskStatus = z.infer<typeof AgentTaskStatus>;

export const AgentTask = z.object({
  id: z.number(),
  type: AgentTaskType,
  status: AgentTaskStatus,
  sessionId: z.string().nullable(),
  input: z.unknown(),
  output: z.unknown(),
  parentTaskId: z.number().nullable(),
  vendorId: z.number().nullable(),
  categoryId: z.number().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type AgentTask = z.infer<typeof AgentTask>;
