import type { Router } from "../infra/router.js";
import type { GogManager } from "../infra/gog-manager.js";
import { googleConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { createServer, type Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../config/paths.js";

export function registerGoogleAuthHandlers(router: Router, gogManager: GogManager) {
  // Save credentials — accepts either a file path or raw JSON content
  router.register("google.set-credentials", async (db, params) => {
    const { credentialsPath, credentialsJson } = params as {
      credentialsPath?: string;
      credentialsJson?: string;
    };

    let filePath = credentialsPath;

    // If raw JSON was pasted, write it to a file
    if (credentialsJson) {
      // Validate it's valid JSON
      JSON.parse(credentialsJson);
      filePath = path.join(getDataDir(), "google-credentials.json");
      fs.writeFileSync(filePath, credentialsJson, "utf-8");
    }

    if (!filePath) throw new Error("Provide either credentialsPath or credentialsJson");

    // Run gog auth credentials to register the OAuth client
    await gogManager.exec(["auth", "credentials", filePath]);

    // Upsert config
    const [existing] = await db.select().from(googleConfig).limit(1);
    if (existing) {
      await db
        .update(googleConfig)
        .set({ credentialsPath: filePath })
        .where(eq(googleConfig.id, existing.id));
    } else {
      await db.insert(googleConfig).values({ credentialsPath: filePath });
    }

    return { ok: true };
  });

  // Start OAuth flow — returns auth URL for the frontend to open
  router.register("google.connect", async (db, params) => {
    const { email, services } = params as { email: string; services: string[] };

    const serviceArg = services.join(",");

    // Step 1: Get the auth URL via remote flow
    const { stdout } = await gogManager.exec([
      "auth", "add", email,
      "--services", serviceArg,
      "--remote", "--step", "1",
    ]);

    // gog prints the auth URL to stdout — extract it
    const urlMatch = stdout.match(/https:\/\/accounts\.google\.com\S+/);
    if (!urlMatch) {
      throw new Error(`Could not extract auth URL from gog output: ${stdout}`);
    }
    const authUrl = urlMatch[0];

    // Spin up a temporary localhost server to capture the OAuth callback
    const { port, waitForCallback } = await createCallbackServer();

    // Store connection info
    const [existing] = await db.select().from(googleConfig).limit(1);
    const values = {
      accountEmail: email,
      services: serviceArg,
    };
    if (existing) {
      await db.update(googleConfig).set(values).where(eq(googleConfig.id, existing.id));
    } else {
      await db.insert(googleConfig).values(values);
    }

    // Wait for callback in background, then complete step 2
    waitForCallback.then(async (callbackUrl) => {
      try {
        await gogManager.exec([
          "auth", "add", email,
          "--remote", "--step", "2",
          "--auth-url", callbackUrl,
        ]);
        console.log(`Google account ${email} connected successfully`);
      } catch (err) {
        console.error("Failed to complete Google auth:", err);
      }
    });

    return { authUrl, callbackPort: port };
  });

  router.register("google.disconnect", async (db) => {
    const [config] = await db.select().from(googleConfig).limit(1);
    if (!config?.accountEmail) throw new Error("No Google account connected");

    try {
      await gogManager.exec(["auth", "remove", config.accountEmail]);
    } catch {
      // Ignore — account may already be removed from gog
    }

    await db
      .update(googleConfig)
      .set({ accountEmail: null })
      .where(eq(googleConfig.id, config.id));

    return { ok: true };
  });

  router.register("google.status", async (db) => {
    const [config] = await db.select().from(googleConfig).limit(1);
    return {
      connected: !!config?.accountEmail,
      email: config?.accountEmail ?? null,
      services: config?.services?.split(",") ?? [],
      autoSend: config?.autoSend === 1,
      hasCredentials: !!config?.credentialsPath,
    };
  });

  router.register("google.update-auto-send", async (db, params) => {
    const { autoSend } = params as { autoSend: boolean };
    const [existing] = await db.select().from(googleConfig).limit(1);
    if (existing) {
      await db
        .update(googleConfig)
        .set({ autoSend: autoSend ? 1 : 0 })
        .where(eq(googleConfig.id, existing.id));
    }
    return { ok: true };
  });
}

/** Spins up a one-shot HTTP server that captures the OAuth redirect */
async function createCallbackServer(): Promise<{
  port: number;
  waitForCallback: Promise<string>;
}> {
  return new Promise((resolveSetup) => {
    let resolveCallback: (url: string) => void;
    const waitForCallback = new Promise<string>((r) => {
      resolveCallback = r;
    });

    const server: Server = createServer((req, res) => {
      const fullUrl = `http://127.0.0.1:${(server.address() as any).port}${req.url}`;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><h1>Authorization complete!</h1><p>You can close this tab and return to the app.</p></body></html>");
      server.close();
      resolveCallback(fullUrl);
    });

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      resolveSetup({ port, waitForCallback });
    });

    // Auto-close after 5 minutes if no callback
    setTimeout(() => {
      server.close();
    }, 5 * 60 * 1000);
  });
}
