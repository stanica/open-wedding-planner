import { describe, it, expect } from "vitest";

describe("WhatsApp self-chat detection", () => {
  it("identifies self-chat when remoteJid matches user jid", () => {
    const userJid = "5511999999999@s.whatsapp.net";
    const remoteJid = "5511999999999@s.whatsapp.net";
    const fromMe = true;

    const isSelfChat = fromMe && remoteJid === userJid;
    expect(isSelfChat).toBe(true);
  });

  it("skips non-self fromMe messages", () => {
    const userJid = "5511999999999@s.whatsapp.net";
    const remoteJid = "5522888888888@s.whatsapp.net";
    const fromMe = true;

    const isSelfChat = fromMe && remoteJid === userJid;
    expect(isSelfChat).toBe(false);
  });

  it("allows incoming messages from others (not fromMe)", () => {
    const userJid = "5511999999999@s.whatsapp.net";
    const remoteJid = "5522888888888@s.whatsapp.net";
    const fromMe = false;

    const isSelfChat = fromMe && remoteJid === userJid;
    expect(isSelfChat).toBe(false);
  });

  it("normalizes JID with :device suffix", () => {
    const userJid = "5511999999999:12@s.whatsapp.net";
    const remoteJid = "5511999999999@s.whatsapp.net";

    const normalizeJid = (jid: string) => jid.replace(/:\d+@/, "@");
    expect(normalizeJid(userJid)).toBe(remoteJid);
  });
});
