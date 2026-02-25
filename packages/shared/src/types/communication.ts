import { z } from "zod";

export const CommunicationDirection = z.enum(["in", "out"]);
export type CommunicationDirection = z.infer<typeof CommunicationDirection>;

export const CommunicationChannel = z.enum(["email", "whatsapp"]);
export type CommunicationChannel = z.infer<typeof CommunicationChannel>;

export const CommunicationStatus = z.enum(["draft", "pending_approval", "sent", "received"]);
export type CommunicationStatus = z.infer<typeof CommunicationStatus>;

export const Communication = z.object({
  id: z.number(),
  vendorId: z.number(),
  direction: CommunicationDirection,
  channel: CommunicationChannel,
  subject: z.string().nullable(),
  bodyOriginal: z.string(),
  bodyTranslated: z.string().nullable(),
  language: z.string().nullable(),
  sentAt: z.string().nullable(),
  status: CommunicationStatus,
  threadId: z.string().nullable(),
});
export type Communication = z.infer<typeof Communication>;
