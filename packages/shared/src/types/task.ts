import { z } from "zod";

export const TaskStatus = z.enum(["pending", "in_progress", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const WeddingTask = z.object({
  id: z.number(),
  title: z.string(),
  owner: z.string().nullable(),
  status: TaskStatus,
  deadline: z.string().nullable(),
  categoryId: z.number().nullable(),
  vendorId: z.number().nullable(),
  notes: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
});
export type WeddingTask = z.infer<typeof WeddingTask>;
