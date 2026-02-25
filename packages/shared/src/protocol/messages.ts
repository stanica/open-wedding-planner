import type { Category, Vendor, WeddingConfig } from "../types/index.js";

// Client -> Gateway
export type ClientMessage =
  | { type: "ping" }
  | { type: "challenge-response"; token: string }
  | { type: "request"; id: string; method: string; params?: unknown };

// Gateway -> Client
export type ServerMessage =
  | { type: "challenge"; token: string }
  | { type: "hello-ok"; state: GatewayStateSnapshot }
  | { type: "pong" }
  | { type: "response"; id: string; ok: true; result?: unknown }
  | { type: "response"; id: string; ok: false; error: string }
  | { type: "event"; seq: number; event: GatewayEvent };

export interface GatewayStateSnapshot {
  version: string;
  channels: {
    whatsapp: ChannelStatus;
    gmail: ChannelStatus;
    calendar: ChannelStatus;
  };
}

export type ChannelStatus = "disconnected" | "connecting" | "connected" | "error";

export type GatewayEvent =
  | { name: "vendor-created"; data: { vendor: Vendor } }
  | { name: "vendor-updated"; data: { vendor: Vendor } }
  | { name: "agent-activity"; data: { sessionKey: string; action: string; detail?: string } }
  | { name: "agent-complete"; data: { taskId: string; summary: string } }
  | { name: "communication-received"; data: { vendorId: number; channel: string } }
  | { name: "draft-ready"; data: { communicationId: number; vendorName: string } }
  | { name: "channel-status"; data: { channel: string; status: ChannelStatus } };
