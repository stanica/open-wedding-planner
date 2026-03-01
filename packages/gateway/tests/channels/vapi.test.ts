import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VapiChannel } from "../../src/channels/vapi.js";

describe("VapiChannel", () => {
  let channel: VapiChannel;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    channel = new VapiChannel({ apiKey: "test-key" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("createCall", () => {
    it("sends POST to VAPI with correct auth and body", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "call-123",
          status: "queued",
          phoneNumber: { number: "+1234567890" },
        }),
      });

      const result = await channel.createCall({
        phoneNumberId: "pn-1",
        assistantId: "asst-1",
        customerNumber: "+1234567890",
      });

      expect(result.id).toBe("call-123");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.vapi.ai/call",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        }),
      );
    });

    it("sends assistantOverrides when provided", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "call-456", status: "queued" }),
      });

      await channel.createCall({
        phoneNumberId: "pn-1",
        assistantId: "asst-1",
        customerNumber: "+1234567890",
        assistantOverrides: {
          variableValues: { vendor_name: "Mary's Flowers" },
        },
      });

      const body = JSON.parse(
        (globalThis.fetch as any).mock.calls[0][1].body,
      );
      expect(body.assistantOverrides.variableValues.vendor_name).toBe(
        "Mary's Flowers",
      );
    });

    it("throws on API error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      await expect(
        channel.createCall({
          phoneNumberId: "pn-1",
          assistantId: "asst-1",
          customerNumber: "+1234567890",
        }),
      ).rejects.toThrow("VAPI API error 401");
    });
  });

  describe("getCall", () => {
    it("fetches call by ID", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "call-123",
          status: "ended",
          artifact: { transcript: "Hello..." },
        }),
      });

      const result = await channel.getCall("call-123");
      expect(result.id).toBe("call-123");
      expect(result.artifact.transcript).toBe("Hello...");
    });
  });

  describe("updatePhoneNumberServerUrl", () => {
    it("patches the phone number with server URL", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "pn-1" }),
      });

      await channel.updatePhoneNumberServerUrl("pn-1", "https://tunnel.example.com/vapi/webhook");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.vapi.ai/phone-number/pn-1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("serverUrl"),
        }),
      );
    });
  });
});
