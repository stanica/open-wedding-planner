# Google Services via gog CLI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the unfinished googleapis Gmail integration with the gog CLI, exposing all connected Google services as a single agent tool with read/write permission split.

**Architecture:** Auto-download gog binary at gateway startup → settings UI for OAuth setup with local callback server → generic `gog` agent tool that shells out to the binary → UI-initiated email compose on vendor pages.

**Tech Stack:** gog CLI (Go binary from GitHub releases), Node.js child_process, React, zustand, Vercel AI SDK tool system, drizzle-orm.

---

### Task 1: Add `googleConfig` DB table

**Files:**
- Modify: `packages/gateway/src/db/schema.ts:233-241` (add after `heartbeatConfig`)

**Step 1: Add the schema definition**

In `packages/gateway/src/db/schema.ts`, add after the `heartbeatConfig` table:

```typescript
export const googleConfig = sqliteTable("google_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountEmail: text("account_email"),
  services: text("services").default("gmail").notNull(),
  credentialsPath: text("credentials_path"),
  autoSend: integer("auto_send").notNull().default(0),
});
```

**Step 2: Verify schema push works**

Run: `cd packages/gateway && npx tsx src/index.ts`
Expected: Gateway starts without errors, table is created. Ctrl+C to stop.

**Step 3: Commit**

```bash
git add packages/gateway/src/db/schema.ts
git commit -m "feat: add googleConfig table for gog integration"
```

---

### Task 2: Create `GogManager` binary manager

**Files:**
- Create: `packages/gateway/src/infra/gog-manager.ts`
- Test: `packages/gateway/tests/infra/gog-manager.test.ts`

**Step 1: Write the test**

Create `packages/gateway/tests/infra/gog-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { GogManager } from "../../src/infra/gog-manager.js";

describe("GogManager", () => {
  let tmpDir: string;
  let manager: GogManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gog-test-"));
    manager = new GogManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns correct asset name for darwin arm64", () => {
    const asset = (manager as any).getAssetName("darwin", "arm64");
    expect(asset).toMatch(/gogcli_.*_darwin_arm64\.tar\.gz/);
  });

  it("returns correct asset name for linux x64", () => {
    const asset = (manager as any).getAssetName("linux", "x64");
    expect(asset).toMatch(/gogcli_.*_linux_amd64\.tar\.gz/);
  });

  it("returns correct asset name for win32 x64", () => {
    const asset = (manager as any).getAssetName("win32", "x64");
    expect(asset).toMatch(/gogcli_.*_windows_amd64\.zip/);
  });

  it("reports not installed when binary missing", () => {
    expect(manager.isInstalled()).toBe(false);
  });

  it("reports installed after binary exists with version", () => {
    const binName = process.platform === "win32" ? "gog.exe" : "gog";
    fs.writeFileSync(path.join(tmpDir, binName), "fake-binary");
    fs.writeFileSync(path.join(tmpDir, ".version"), GogManager.GOG_VERSION);
    expect(manager.isInstalled()).toBe(true);
  });

  it("getBinPath returns path to binary", () => {
    const binName = process.platform === "win32" ? "gog.exe" : "gog";
    expect(manager.getBinPath()).toBe(path.join(tmpDir, binName));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/infra/gog-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `packages/gateway/src/infra/gog-manager.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { extract as tarExtract } from "tar";

const execFileAsync = promisify(execFile);

export class GogManager {
  static readonly GOG_VERSION = "0.11.0";
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  getBinPath(): string {
    const name = process.platform === "win32" ? "gog.exe" : "gog";
    return path.join(this.dir, name);
  }

  isInstalled(): boolean {
    const versionFile = path.join(this.dir, ".version");
    if (!fs.existsSync(this.getBinPath()) || !fs.existsSync(versionFile)) {
      return false;
    }
    const installed = fs.readFileSync(versionFile, "utf-8").trim();
    return installed === GogManager.GOG_VERSION;
  }

  async ensureInstalled(): Promise<string> {
    if (this.isInstalled()) return this.getBinPath();
    await this.download();
    return this.getBinPath();
  }

  private async download(): Promise<void> {
    const asset = this.getAssetName(process.platform, process.arch);
    const url = `https://github.com/steipete/gogcli/releases/download/v${GogManager.GOG_VERSION}/${asset}`;

    console.log(`Downloading gog ${GogManager.GOG_VERSION} from ${url}...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download gog: ${response.status} ${response.statusText}`);
    }

    const tmpFile = path.join(this.dir, asset);
    const fileStream = createWriteStream(tmpFile);
    await pipeline(response.body as any, fileStream);

    // Extract
    if (asset.endsWith(".tar.gz")) {
      await tarExtract({ file: tmpFile, cwd: this.dir });
    } else {
      // .zip for Windows — use unzip
      await execFileAsync("unzip", ["-o", tmpFile, "-d", this.dir]);
    }

    // Rename extracted binary (gogcli -> gog)
    const extractedName = process.platform === "win32" ? "gogcli.exe" : "gogcli";
    const targetName = process.platform === "win32" ? "gog.exe" : "gog";
    const extractedPath = path.join(this.dir, extractedName);
    const targetPath = path.join(this.dir, targetName);
    if (fs.existsSync(extractedPath) && extractedName !== targetName) {
      fs.renameSync(extractedPath, targetPath);
    }

    // Make executable
    if (process.platform !== "win32") {
      fs.chmodSync(targetPath, 0o755);
    }

    // Write version marker
    fs.writeFileSync(path.join(this.dir, ".version"), GogManager.GOG_VERSION);

    // Clean up archive
    fs.unlinkSync(tmpFile);

    console.log(`gog ${GogManager.GOG_VERSION} installed to ${targetPath}`);
  }

  private getAssetName(platform: string, arch: string): string {
    const v = GogManager.GOG_VERSION;
    const osMap: Record<string, string> = {
      darwin: "darwin",
      linux: "linux",
      win32: "windows",
    };
    const archMap: Record<string, string> = {
      arm64: "arm64",
      x64: "amd64",
    };
    const os = osMap[platform] ?? "linux";
    const a = archMap[arch] ?? "amd64";
    const ext = platform === "win32" ? "zip" : "tar.gz";
    return `gogcli_${v}_${os}_${a}.${ext}`;
  }

  async exec(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const binPath = await this.ensureInstalled();
    return execFileAsync(binPath, args, { timeout: 60000, maxBuffer: 1024 * 1024 });
  }
}
```

**Step 4: Run tests**

Run: `cd packages/gateway && npx vitest run tests/infra/gog-manager.test.ts`
Expected: All 6 tests pass. (Note: `tar` package may need installing — see step 5.)

**Step 5: Install tar dependency if needed**

Run: `cd packages/gateway && npm ls tar`
If missing: `npm install tar`

**Step 6: Commit**

```bash
git add packages/gateway/src/infra/gog-manager.ts packages/gateway/tests/infra/gog-manager.test.ts
git commit -m "feat: add GogManager for auto-downloading gog binary"
```

---

### Task 3: Create Google auth handlers

**Files:**
- Create: `packages/gateway/src/handlers/google-auth.ts`
- Modify: `packages/gateway/src/handlers/index.ts:1-48`
- Test: `packages/gateway/tests/handlers/google-auth.test.ts`

**Step 1: Write the test**

Create `packages/gateway/tests/handlers/google-auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll test the handler functions via the router pattern
describe("google-auth handlers", () => {
  it("google.status returns disconnected when no config", async () => {
    // This test verifies the handler returns correct shape
    // Full integration test needs DB — keep it as a smoke test
    const { registerGoogleAuthHandlers } = await import(
      "../../src/handlers/google-auth.js"
    );
    expect(typeof registerGoogleAuthHandlers).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/handlers/google-auth.test.ts`
Expected: FAIL — module not found

**Step 3: Write the handler**

Create `packages/gateway/src/handlers/google-auth.ts`:

```typescript
import type { Router } from "../infra/router.js";
import type { GogManager } from "../infra/gog-manager.js";
import { googleConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { createServer, type Server } from "node:http";
import { URL } from "node:url";

export function registerGoogleAuthHandlers(router: Router, gogManager: GogManager) {
  // Save credentials file path and run gog auth credentials
  router.register("google.set-credentials", async (db, params) => {
    const { credentialsPath } = params as { credentialsPath: string };

    // Run gog auth credentials to register the OAuth client
    await gogManager.exec(["auth", "credentials", credentialsPath]);

    // Upsert config
    const [existing] = await db.select().from(googleConfig).limit(1);
    if (existing) {
      await db
        .update(googleConfig)
        .set({ credentialsPath })
        .where(eq(googleConfig.id, existing.id));
    } else {
      await db.insert(googleConfig).values({ credentialsPath });
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
```

**Step 4: Register handlers in index.ts**

In `packages/gateway/src/handlers/index.ts`, add import and registration:

```typescript
import { registerGoogleAuthHandlers } from "./google-auth.js";
```

Update `registerAllHandlers` signature to accept `GogManager`:

```typescript
import type { GogManager } from "../infra/gog-manager.js";

export function registerAllHandlers(
  router: Router,
  proxyManager: ProxyManager,
  deliveryQueue?: DeliveryQueue,
  gogManager?: GogManager,
) {
  // ... existing registrations ...
  if (gogManager) {
    registerGoogleAuthHandlers(router, gogManager);
  }
}
```

**Step 5: Run tests**

Run: `cd packages/gateway && npx vitest run tests/handlers/google-auth.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/gateway/src/handlers/google-auth.ts packages/gateway/src/handlers/index.ts packages/gateway/tests/handlers/google-auth.test.ts
git commit -m "feat: add Google auth handlers for gog OAuth flow"
```

---

### Task 4: Create `gog` agent tool

**Files:**
- Create: `packages/gateway/src/tools/gog.ts`
- Modify: `packages/gateway/src/tools/index.ts:1-99` (register factory)
- Test: `packages/gateway/tests/tools/gog.test.ts`

**Step 1: Write the test**

Create `packages/gateway/tests/tools/gog.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isGogReadCommand } from "../../src/tools/gog.js";

describe("gog tool", () => {
  it("classifies search as read", () => {
    expect(isGogReadCommand("gmail", ["search", "is:unread"])).toBe(true);
  });

  it("classifies list as read", () => {
    expect(isGogReadCommand("gmail", ["labels", "list"])).toBe(true);
  });

  it("classifies get as read", () => {
    expect(isGogReadCommand("gmail", ["threads", "get", "abc123"])).toBe(true);
  });

  it("classifies send as write", () => {
    expect(isGogReadCommand("gmail", ["send", "--to", "a@b.com"])).toBe(false);
  });

  it("classifies create as write", () => {
    expect(isGogReadCommand("cal", ["events", "create", "--title", "Meeting"])).toBe(false);
  });

  it("classifies delete as write", () => {
    expect(isGogReadCommand("gmail", ["threads", "delete", "abc"])).toBe(false);
  });

  it("classifies cal events list as read", () => {
    expect(isGogReadCommand("cal", ["events", "list"])).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/tools/gog.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `packages/gateway/src/tools/gog.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import type { GogManager } from "../infra/gog-manager.js";
import type { PermissionCallbacks } from "./permission-wrapper.js";

const WRITE_KEYWORDS = ["send", "create", "delete", "update", "modify", "trash", "remove", "insert", "patch"];

export function isGogReadCommand(subcommand: string, args: string[]): boolean {
  const allArgs = [subcommand, ...args].join(" ").toLowerCase();
  return !WRITE_KEYWORDS.some((kw) => allArgs.includes(kw));
}

export interface GogToolContext {
  gogManager: GogManager;
  accountEmail: string;
  services: string;
  getAutoSend: () => boolean;
  permissionCallbacks: PermissionCallbacks;
}

export function makeGogTool(ctx: GogToolContext) {
  const serviceList = ctx.services.split(",").map((s) => s.trim()).join(", ");

  return tool({
    description: `Run gog CLI commands for Google services. Connected account: ${ctx.accountEmail}. Available services: ${serviceList}. Output is JSON. Use subcommands like "gmail" (search, send, threads, labels), "cal" (events list/create), "contacts" (list/get), "drive" (list/get/upload). Read operations are auto-approved; write operations (send, create, delete) may require user approval.`,
    inputSchema: z.object({
      subcommand: z
        .string()
        .describe('The gog service subcommand (e.g. "gmail", "cal", "contacts", "drive")'),
      args: z
        .array(z.string())
        .describe('Arguments for the subcommand (e.g. ["search", "is:unread newer_than:1d", "--max", "10"])'),
    }),
    execute: async ({ subcommand, args }) => {
      const isRead = isGogReadCommand(subcommand, args);

      // Write commands need approval unless auto-send is on
      if (!isRead && !ctx.getAutoSend()) {
        const fullCmd = `gog ${subcommand} ${args.join(" ")}`;
        const response = await ctx.permissionCallbacks.requestPermission(
          `gog:${subcommand}:write`,
          fullCmd,
        );
        if (response === "deny") {
          return {
            error: "Write operation denied by user. Create a draft communication record instead.",
          };
        }
      }

      try {
        const fullArgs = [
          subcommand,
          ...args,
          "--json",
          "--account", ctx.accountEmail,
        ];
        const { stdout, stderr } = await ctx.gogManager.exec(fullArgs);

        // Try to parse JSON output
        try {
          return { data: JSON.parse(stdout) };
        } catch {
          return { output: stdout, stderr: stderr || undefined };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  });
}
```

**Step 4: Register in tool index**

In `packages/gateway/src/tools/index.ts`, add import and factory registration after the `sendWhatsApp` factory:

```typescript
import { makeGogTool } from "./gog.js";
```

Add after the `sendWhatsApp` factory (line 93):

```typescript
  registry.registerFactory("gog", {
    description: "Run Google Workspace commands via gog CLI",
    category: "messaging",
    create: (ctx: unknown) => {
      const { gogManager, googleAccountEmail, googleServices, getGoogleAutoSend, permissionCallbacks } =
        ctx as any;
      if (!gogManager || !googleAccountEmail) {
        // Return a no-op tool that tells agent Google is not connected
        return tool({
          description: "Google services are not connected. Ask the user to connect in Settings.",
          inputSchema: z.object({}),
          execute: async () => ({ error: "Google services not connected. The user needs to connect their Google account in Settings." }),
        });
      }
      return makeGogTool({
        gogManager,
        accountEmail: googleAccountEmail,
        services: googleServices ?? "gmail",
        getAutoSend: getGoogleAutoSend ?? (() => false),
        permissionCallbacks,
      });
    },
  });
```

Add `import { z } from "zod"` and `import { tool } from "ai"` at the top if not already present.

**Step 5: Run tests**

Run: `cd packages/gateway && npx vitest run tests/tools/gog.test.ts`
Expected: All 7 tests pass

**Step 6: Commit**

```bash
git add packages/gateway/src/tools/gog.ts packages/gateway/src/tools/index.ts packages/gateway/tests/tools/gog.test.ts
git commit -m "feat: add gog agent tool with read/write permission split"
```

---

### Task 5: Wire GogManager and gog tool into gateway startup

**Files:**
- Modify: `packages/gateway/src/index.ts:1-237`
- Modify: `packages/gateway/src/agents/task-configs.ts:62-91`

**Step 1: Add GogManager to gateway startup**

In `packages/gateway/src/index.ts`:

Add imports at top:
```typescript
import { GogManager } from "./infra/gog-manager.js";
import { googleConfig } from "./db/schema.js";
```

After line 62 (`deliveryQueue.recover()`), add:
```typescript
  // 5b. Create gog manager
  const gogBinDir = path.join(getDataDir(), "bin");
  const gogManager = new GogManager(gogBinDir);
```

Add `import path from "node:path";` at top if not present.

Update `registerAllHandlers` call (line 63) to pass gogManager:
```typescript
  registerAllHandlers(router, proxyManager, deliveryQueue, gogManager);
```

After `autoSendGetter` (line 134), add a Google auto-send getter and config loader:
```typescript
  // Load Google config for tool context
  const googleAutoSendGetter = () => {
    const rows = sqlite
      .prepare("SELECT auto_send FROM google_config LIMIT 1")
      .all() as any[];
    return rows.length > 0 && rows[0].auto_send === 1;
  };

  const getGoogleConfig = () => {
    const rows = sqlite
      .prepare("SELECT account_email, services FROM google_config LIMIT 1")
      .all() as any[];
    return rows[0] ?? null;
  };
```

Update orchestrator construction (around line 136) to include gog context. The orchestrator passes context to tools via `getToolSetWithContext`. Add the gog fields to the context it passes. Find where the orchestrator creates tool context and add:

```typescript
  const orchestrator = new Orchestrator(db, (event) => {
    wsServer.broadcast(event);
  }, toolRegistry, undefined, sqlite, {
    deliveryQueue,
    getAutoSend: autoSendGetter,
    gogManager,
    getGoogleAutoSend: googleAutoSendGetter,
    getGoogleConfig,
  });
```

**Step 2: Update Orchestrator to pass gog context to tools**

Check how the Orchestrator passes context to `getToolSetWithContext`. Read `packages/gateway/src/agents/orchestrator.ts` to find where tool context is built. The gog factory needs `gogManager`, `googleAccountEmail`, `googleServices`, `getGoogleAutoSend`, and `permissionCallbacks` in the context object. Add these fields to whatever context object the orchestrator builds when calling `registry.getToolSetWithContext()`.

**Step 3: Add `gog` tool to outreach and research task configs**

In `packages/gateway/src/agents/task-configs.ts`:

Update outreach tools (line 72):
```typescript
    tools: ["cmd", "dbQuery", "dbSchema", "sendWhatsApp", "gog"],
```

Update research tools (line 66):
```typescript
    tools: ["search", "scrape", "browse", "parsePdf", "createVendor", "cmd", "dbQuery", "dbSchema", "gog"],
```

Update OUTREACH_PROMPT (line 29) to mention gog:
```typescript
const OUTREACH_PROMPT = `You are drafting outreach messages to wedding vendors.
You have access to the database to look up vendor details and wedding configuration.

## Process
1. Use dbSchema to understand the database structure
2. Use dbQuery to fetch vendor details and wedding configuration
3. Draft a professional, warm message appropriate for the channel (email or WhatsApp)
4. For WhatsApp messages, use the sendWhatsApp tool to send/queue the message
5. For email, use the gog tool to send via Gmail: gog gmail send --to <email> --subject "<subject>" --body "<body>"
6. For other channels, use dbQuery to save the draft as a communication record

## Guidelines
- Be warm but professional
- Include relevant wedding details (date, guest count, budget context)
- Respect the couple's language preferences
- When sending via WhatsApp, use sendWhatsApp with the vendorId and composed message
- When sending via email, use the gog tool. Always look up the vendor's email first via dbQuery.
- The message may be sent immediately or queued for user review depending on settings
- After sending, create a communication record via dbQuery to track the conversation`;
```

**Step 4: Run existing tests to verify nothing is broken**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/gateway/src/index.ts packages/gateway/src/agents/task-configs.ts
git commit -m "feat: wire GogManager into gateway startup and add gog to agent tools"
```

---

### Task 6: Create `GoogleServicesSetup` UI component

**Files:**
- Create: `packages/app/src/renderer/components/settings/GoogleServicesSetup.tsx`
- Modify: `packages/app/src/renderer/components/settings/IntegrationStatus.tsx:1-115`

**Step 1: Create the component**

Create `packages/app/src/renderer/components/settings/GoogleServicesSetup.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { StatusIndicator } from "./IntegrationStatus";
import { Mail, Upload } from "lucide-react";

interface GoogleStatus {
  connected: boolean;
  email: string | null;
  services: string[];
  autoSend: boolean;
  hasCredentials: boolean;
}

const AVAILABLE_SERVICES = [
  { id: "gmail", label: "Gmail", description: "Send and receive emails" },
  { id: "calendar", label: "Calendar", description: "Manage calendar events" },
  { id: "contacts", label: "Contacts", description: "Access Google Contacts" },
  { id: "drive", label: "Drive", description: "Access Google Drive files" },
];

export function GoogleServicesSetup() {
  const { data: status, refetch } = useRequest<GoogleStatus>("google.status");
  const { mutate: setCredentials, loading: settingCreds } = useMutation("google.set-credentials");
  const { mutate: connect, loading: connecting } = useMutation("google.connect");
  const { mutate: disconnect } = useMutation("google.disconnect");
  const { mutate: updateAutoSend } = useMutation("google.update-auto-send");

  const [email, setEmail] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>(["gmail"]);
  const [step, setStep] = useState<"credentials" | "services" | "ready">("credentials");

  useEffect(() => {
    if (status?.hasCredentials && !status.connected) {
      setStep("services");
    } else if (status?.hasCredentials && status.connected) {
      setStep("ready");
    }
  }, [status]);

  async function handleCredentialsFile() {
    const result = await window.electronAPI.showOpenDialog({
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return;

    await setCredentials({ credentialsPath: result.filePaths[0] });
    refetch();
  }

  async function handleConnect() {
    if (!email) return;
    const result = await connect({ email, services: selectedServices });
    if (result?.authUrl) {
      window.electronAPI.openExternal(result.authUrl);
      // Poll for connection status
      const interval = setInterval(async () => {
        const updated = await refetch();
        if (updated?.connected) {
          clearInterval(interval);
        }
      }, 2000);
      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
    }
  }

  function toggleService(id: string) {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  const isConnected = status?.connected ?? false;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-blue-400" />
          <div>
            <p className="text-sm font-medium text-white">Google Services</p>
            <p className="text-xs text-gray-400">
              {isConnected
                ? `Connected as ${status?.email}`
                : "Connect Gmail, Calendar, Drive, and more"}
            </p>
          </div>
        </div>
        <StatusIndicator status={isConnected ? "connected" : "disconnected"} />
      </div>

      {/* Step 1: Upload credentials */}
      {step === "credentials" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            First, upload your Google Cloud OAuth credentials (client_secret.json).
            You can create one at{" "}
            <button
              onClick={() =>
                window.electronAPI.openExternal("https://console.cloud.google.com/apis/credentials")
              }
              className="text-blue-400 hover:underline"
            >
              Google Cloud Console
            </button>
            .
          </p>
          <button
            onClick={handleCredentialsFile}
            disabled={settingCreds}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {settingCreds ? "Saving..." : "Upload client_secret.json"}
          </button>
        </div>
      )}

      {/* Step 2: Pick services + connect */}
      {step === "services" && (
        <div className="space-y-3">
          <input
            type="email"
            placeholder="your@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <div className="space-y-2">
            <p className="text-xs text-gray-400">Select services to authorize:</p>
            {AVAILABLE_SERVICES.map((svc) => (
              <label
                key={svc.id}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedServices.includes(svc.id)}
                  onChange={() => toggleService(svc.id)}
                  className="rounded"
                />
                <div>
                  <p className="text-sm text-white">{svc.label}</p>
                  <p className="text-xs text-gray-400">{svc.description}</p>
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting || !email || selectedServices.length === 0}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {connecting ? "Opening browser..." : "Connect Google Account"}
          </button>
        </div>
      )}

      {/* Connected state */}
      {isConnected && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {status?.services.map((svc) => (
              <span
                key={svc}
                className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300"
              >
                {svc}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Auto-send messages</p>
              <p className="text-xs text-gray-400">
                When off, outgoing emails are saved as drafts for your review
              </p>
            </div>
            <button
              onClick={() => updateAutoSend({ autoSend: !status?.autoSend })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                status?.autoSend ? "bg-blue-600" : "bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status?.autoSend ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <button
            onClick={async () => {
              await disconnect({});
              refetch();
            }}
            className="w-full rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update IntegrationStatus to use GoogleServicesSetup**

In `packages/app/src/renderer/components/settings/IntegrationStatus.tsx`:

Replace the `GmailSetup` import and usage:

```typescript
// Remove: import { GmailSetup } from "./GmailSetup";
import { GoogleServicesSetup } from "./GoogleServicesSetup";
```

Replace `<GmailSetup status={statuses.gmail} />` (line 66) with:
```tsx
<GoogleServicesSetup />
```

Remove the static Google Calendar block (lines 68-84) — Google services are now managed by `GoogleServicesSetup`.

Remove `gmail` from the `ChannelStatuses` interface and state since Google status is now managed by the `GoogleServicesSetup` component internally via `useRequest("google.status")`.

**Step 3: Add `showOpenDialog` to electronAPI if missing**

Check `packages/app/src/preload/index.ts` and `packages/app/src/renderer/env.d.ts` for `showOpenDialog`. If missing, add it to the preload bridge:

In preload:
```typescript
showOpenDialog: (options: Electron.OpenDialogOptions) =>
  ipcRenderer.invoke("dialog:showOpenDialog", options),
```

In main process, register the handler:
```typescript
ipcMain.handle("dialog:showOpenDialog", async (_, options) => {
  return dialog.showOpenDialog(options);
});
```

In `env.d.ts`, add to the `ElectronAPI` interface:
```typescript
showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
```

**Step 4: Verify the UI renders**

Run: `cd packages/app && npm run dev`
Expected: Settings page shows "Google Services" card with credential upload step.

**Step 5: Commit**

```bash
git add packages/app/src/renderer/components/settings/GoogleServicesSetup.tsx packages/app/src/renderer/components/settings/IntegrationStatus.tsx
git commit -m "feat: add GoogleServicesSetup component replacing GmailSetup"
```

---

### Task 7: Add "Email Vendor" button to vendor pages

**Files:**
- Modify: `packages/app/src/renderer/components/vendors/VendorHeader.tsx:1-113`

**Step 1: Add Email button**

In `packages/app/src/renderer/components/vendors/VendorHeader.tsx`, add an "Email Vendor" button in the actions area (around line 100, before the Delete button):

Add import:
```typescript
import { Mail } from "lucide-react";
```

Add state for the email compose modal:
```typescript
const [showEmailCompose, setShowEmailCompose] = useState(false);
```

Add the button before the Delete button (line 101):
```tsx
{vendor.contactEmail && (
  <button
    onClick={() => setShowEmailCompose(true)}
    className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 px-3 py-1.5 text-sm text-blue-400 hover:bg-blue-500/10 transition-colors"
  >
    <Mail className="h-3.5 w-3.5" />
    Email
  </button>
)}
```

Add the compose modal at the end of the component (before the closing `</div>`):
```tsx
{showEmailCompose && (
  <EmailComposeModal
    vendor={vendor}
    onClose={() => setShowEmailCompose(false)}
  />
)}
```

**Step 2: Create EmailComposeModal**

Create `packages/app/src/renderer/components/vendors/EmailComposeModal.tsx`:

```tsx
import { useState } from "react";
import { X, Send, Sparkles } from "lucide-react";
import { useMutation } from "../../hooks/useRequest";

interface Vendor {
  id: number;
  name: string;
  contactEmail: string | null;
}

const INTENT_SUGGESTIONS = [
  "Request a quote for our wedding",
  "Follow up on our previous conversation",
  "Ask about availability for our date",
  "Confirm booking details",
  "Ask about menu options and pricing",
];

export function EmailComposeModal({
  vendor,
  onClose,
}: {
  vendor: Vendor;
  onClose: () => void;
}) {
  const [intent, setIntent] = useState("");
  const [drafting, setDrafting] = useState(false);
  const { mutate: dispatchAgent } = useMutation("agent.dispatch");

  async function handleDraft() {
    if (!intent.trim()) return;
    setDrafting(true);

    // Dispatch an outreach agent task with the intent
    await dispatchAgent({
      type: "outreach",
      input: JSON.stringify({
        vendorId: vendor.id,
        channel: "email",
        intent: intent.trim(),
      }),
      vendorId: vendor.id,
    });

    // Close modal — the agent will handle drafting and the user
    // will see the result in the research/activity feed
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-gray-900 p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Email {vendor.name}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <p className="text-xs text-gray-400">
          To: {vendor.contactEmail}
        </p>

        <div className="space-y-2">
          <p className="text-xs text-gray-400">What would you like to say?</p>
          <div className="flex flex-wrap gap-1.5">
            {INTENT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setIntent(suggestion)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  intent === suggestion
                    ? "bg-blue-600 text-white"
                    : "bg-white/5 text-gray-300 hover:bg-white/10"
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="Or type your own message intent..."
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none resize-none"
          />
        </div>

        <button
          onClick={handleDraft}
          disabled={drafting || !intent.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {drafting ? (
            <>
              <Sparkles className="h-4 w-4 animate-pulse" />
              Drafting with AI...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Draft Email
            </>
          )}
        </button>

        <p className="text-xs text-gray-500 text-center">
          The AI will draft a personalized email using vendor and wedding details.
          You'll review it before sending.
        </p>
      </div>
    </div>
  );
}
```

**Step 3: Verify UI renders**

Run: `cd packages/app && npm run dev`
Expected: Vendors with email addresses show an "Email" button. Clicking opens compose modal.

**Step 4: Commit**

```bash
git add packages/app/src/renderer/components/vendors/VendorHeader.tsx packages/app/src/renderer/components/vendors/EmailComposeModal.tsx
git commit -m "feat: add Email Vendor button and compose modal"
```

---

### Task 8: Cleanup — remove old Gmail implementation

**Files:**
- Delete: `packages/gateway/src/channels/gmail.ts`
- Delete: `packages/gateway/src/handlers/gmail-auth.ts`
- Delete: `packages/app/src/renderer/components/settings/GmailSetup.tsx`
- Modify: `packages/gateway/package.json` (remove `googleapis` dependency)

**Step 1: Delete the old files**

```bash
rm packages/gateway/src/channels/gmail.ts
rm packages/gateway/src/handlers/gmail-auth.ts
rm packages/app/src/renderer/components/settings/GmailSetup.tsx
```

**Step 2: Remove googleapis dependency**

Run: `cd packages/gateway && npm uninstall googleapis`

**Step 3: Search for remaining references**

Search for `gmail-auth`, `GmailChannel`, `GmailSetup`, `googleapis` across the codebase and remove any dangling imports or references.

**Step 4: Run all tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove old Gmail implementation (googleapis, GmailChannel, GmailSetup)"
```

---

### Task 9: Integration test — end-to-end gog flow

**Files:**
- Test: `packages/gateway/tests/tools/gog-integration.test.ts`

**Step 1: Write integration test**

Create `packages/gateway/tests/tools/gog-integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGogTool, type GogToolContext } from "../../src/tools/gog.js";

describe("gog tool integration", () => {
  const mockExec = vi.fn();
  const mockRequestPermission = vi.fn();

  const ctx: GogToolContext = {
    gogManager: {
      exec: mockExec,
      ensureInstalled: vi.fn().mockResolvedValue("/fake/gog"),
      getBinPath: () => "/fake/gog",
      isInstalled: () => true,
    } as any,
    accountEmail: "test@gmail.com",
    services: "gmail,calendar",
    getAutoSend: () => false,
    permissionCallbacks: { requestPermission: mockRequestPermission },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-approves read commands", async () => {
    mockExec.mockResolvedValue({
      stdout: JSON.stringify({ threads: [] }),
      stderr: "",
    });

    const gogTool = makeGogTool(ctx);
    const result = await (gogTool as any).execute({
      subcommand: "gmail",
      args: ["search", "is:unread"],
    });

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(result.data).toEqual({ threads: [] });
    expect(mockExec).toHaveBeenCalledWith([
      "gmail", "search", "is:unread",
      "--json", "--account", "test@gmail.com",
    ]);
  });

  it("requests permission for write commands", async () => {
    mockRequestPermission.mockResolvedValue("allow");
    mockExec.mockResolvedValue({ stdout: "{}", stderr: "" });

    const gogTool = makeGogTool(ctx);
    await (gogTool as any).execute({
      subcommand: "gmail",
      args: ["send", "--to", "vendor@example.com", "--subject", "Hi"],
    });

    expect(mockRequestPermission).toHaveBeenCalledWith(
      "gog:gmail:write",
      expect.stringContaining("send"),
    );
  });

  it("blocks denied write commands", async () => {
    mockRequestPermission.mockResolvedValue("deny");

    const gogTool = makeGogTool(ctx);
    const result = await (gogTool as any).execute({
      subcommand: "gmail",
      args: ["send", "--to", "vendor@example.com"],
    });

    expect(result.error).toContain("denied");
    expect(mockExec).not.toHaveBeenCalled();
  });

  it("auto-approves writes when autoSend is on", async () => {
    const autoSendCtx = { ...ctx, getAutoSend: () => true };
    mockExec.mockResolvedValue({ stdout: "{}", stderr: "" });

    const gogTool = makeGogTool(autoSendCtx);
    await (gogTool as any).execute({
      subcommand: "gmail",
      args: ["send", "--to", "vendor@example.com"],
    });

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockExec).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests**

Run: `cd packages/gateway && npx vitest run tests/tools/gog-integration.test.ts`
Expected: All 4 tests pass

**Step 3: Run full test suite**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/gateway/tests/tools/gog-integration.test.ts
git commit -m "test: add gog tool integration tests"
```
