import { z } from "zod";

export const Session = z.object({
  id: z.number(),
  key: z.string(),
  context: z.unknown(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
});
export type Session = z.infer<typeof Session>;
