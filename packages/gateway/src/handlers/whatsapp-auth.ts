import type { Router } from "../infra/router.js";
import type { WhatsAppChannel } from "../channels/whatsapp.js";

export function registerWhatsAppAuthHandlers(
  router: Router,
  whatsapp: WhatsAppChannel | null,
) {
  router.register("whatsapp.connect", async () => {
    if (!whatsapp) throw new Error("WhatsApp not configured");
    await whatsapp.connect();
    return { ok: true };
  });

  router.register("whatsapp.disconnect", async () => {
    if (!whatsapp) throw new Error("WhatsApp not configured");
    whatsapp.disconnect();
    return { ok: true };
  });

  router.register("whatsapp.status", async () => {
    return { connected: whatsapp?.isConnected() ?? false };
  });
}
