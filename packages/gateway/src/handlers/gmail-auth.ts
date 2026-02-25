import type { Router } from "../infra/router.js";
import type { GmailChannel } from "../channels/gmail.js";

export function registerGmailAuthHandlers(router: Router, gmail: GmailChannel | null) {
  router.register("gmail.auth-url", async () => {
    if (!gmail) throw new Error("Gmail not configured");
    return { url: gmail.getAuthUrl() };
  });

  router.register("gmail.auth-callback", async (_db, params) => {
    if (!gmail) throw new Error("Gmail not configured");
    const { code } = params as { code: string };
    await gmail.handleAuthCallback(code);
    return { ok: true };
  });

  router.register("gmail.status", async () => {
    return { connected: gmail?.isConnected() ?? false };
  });
}
