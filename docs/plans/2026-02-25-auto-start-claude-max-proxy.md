# Auto-Start Claude Max Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically spawn and manage the `claude-max-api-proxy` process when the user selects Claude Max as their AI provider, so they never need to run it manually.

**Architecture:** The gateway manages the proxy as a child process via a new `proxy-manager.ts` module. When AI config changes to `claude-max`, the gateway spawns the proxy; when it changes away, it stops it. The proxy is also started on gateway boot if the saved config uses `claude-max`. Graceful shutdown kills the proxy before tearing down the gateway. The UI removes manual proxy instructions and instead shows Claude Code CLI setup guidance.

**Tech Stack:** Node.js `child_process.spawn`, `claude-max-api-proxy` npm package, existing gateway Router/handler patterns.

---

### Task 1: Add `claude-max-api-proxy` dependency

**Files:**
- Modify: `packages/gateway/package.json`

**Step 1: Install the dependency**

Run: `cd packages/gateway && npm install claude-max-api-proxy`

**Step 2: Verify installation**

Run: `ls node_modules/.bin/claude-max-api`
Expected: binary exists

**Step 3: Commit**

```bash
git add packages/gateway/package.json package-lock.json
git commit -m "chore: add claude-max-api-proxy dependency"
```

---

### Task 2: Create `proxy-manager.ts` — spawn/stop/health

**Files:**
- Create: `packages/gateway/src/infra/proxy-manager.ts`
- Test: `packages/gateway/tests/infra/proxy-manager.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/gateway/tests/infra/proxy-manager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProxyManager } from "../../src/infra/proxy-manager.js";

describe("ProxyManager", () => {
  let manager: ProxyManager;

  beforeEach(() => {
    manager = new ProxyManager();
  });

  afterEach(async () => {
    await manager.stop();
  });

  it("is not running initially", () => {
    expect(manager.isRunning()).toBe(false);
  });

  it("reports status correctly", () => {
    const status = manager.getStatus();
    expect(status.running).toBe(false);
    expect(status.url).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/infra/proxy-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// packages/gateway/src/infra/proxy-manager.ts
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ProxyStatus {
  running: boolean;
  url: string | null;
  error: string | null;
}

const DEFAULT_PORT = 3456;
const HEALTH_CHECK_INTERVAL = 1000;
const HEALTH_CHECK_MAX_RETRIES = 15;

export class ProxyManager {
  private process: ChildProcess | null = null;
  private proxyUrl: string | null = null;
  private lastError: string | null = null;

  /**
   * Spawn the claude-max-api-proxy process and wait for it to become healthy.
   * Resolves with the proxy base URL (e.g. "http://localhost:3456/v1").
   */
  async start(port: number = DEFAULT_PORT): Promise<string> {
    if (this.process) {
      return this.proxyUrl!;
    }

    // Resolve the binary from our own node_modules
    const binPath = this.resolveBin();

    return new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [binPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PORT: String(port),
        },
      });

      this.process = child;
      this.lastError = null;

      child.stderr?.on("data", (data: Buffer) => {
        console.error("[claude-max-proxy]", data.toString().trim());
      });

      child.stdout?.on("data", (data: Buffer) => {
        console.log("[claude-max-proxy]", data.toString().trim());
      });

      child.on("error", (err) => {
        this.lastError = err.message;
        this.process = null;
        this.proxyUrl = null;
        reject(new Error(`Failed to start proxy: ${err.message}`));
      });

      child.on("exit", (code) => {
        if (code !== null && code !== 0) {
          this.lastError = `Proxy exited with code ${code}`;
        }
        this.process = null;
        this.proxyUrl = null;
      });

      // Poll for health
      const baseUrl = `http://localhost:${port}/v1`;
      this.waitForHealthy(baseUrl)
        .then(() => {
          this.proxyUrl = baseUrl;
          resolve(baseUrl);
        })
        .catch((err) => {
          this.lastError = err.message;
          this.stop();
          reject(err);
        });
    });
  }

  /**
   * Gracefully stop the proxy process.
   */
  async stop(): Promise<void> {
    const proc = this.process;
    if (!proc) return;

    this.process = null;
    this.proxyUrl = null;

    return new Promise<void>((resolve) => {
      const killTimeout = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 5000);

      proc.on("exit", () => {
        clearTimeout(killTimeout);
        resolve();
      });

      proc.kill("SIGTERM");
    });
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  getStatus(): ProxyStatus {
    return {
      running: this.isRunning(),
      url: this.proxyUrl,
      error: this.lastError,
    };
  }

  private resolveBin(): string {
    // Resolve from this package's node_modules
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    // In built output (dist/), go up to package root
    const packageRoot = path.resolve(thisDir, "..");
    return path.join(
      packageRoot,
      "node_modules",
      ".bin",
      "claude-max-api",
    );
  }

  private async waitForHealthy(baseUrl: string): Promise<void> {
    for (let i = 0; i < HEALTH_CHECK_MAX_RETRIES; i++) {
      // If process died while we were waiting, bail
      if (!this.process || this.process.killed) {
        throw new Error(
          this.lastError ?? "Proxy process exited before becoming healthy",
        );
      }

      try {
        const res = await fetch(`${baseUrl}/models`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return;
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL));
    }
    throw new Error(
      "Proxy failed to become healthy within timeout. Is Claude Code CLI installed and authenticated?",
    );
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/infra/proxy-manager.test.ts`
Expected: PASS (2 tests — initial state checks only, no spawning)

**Step 5: Commit**

```bash
git add packages/gateway/src/infra/proxy-manager.ts packages/gateway/tests/infra/proxy-manager.test.ts
git commit -m "feat: add ProxyManager for claude-max-api-proxy lifecycle"
```

---

### Task 3: Integrate proxy into `ai-config.update` handler

**Files:**
- Modify: `packages/gateway/src/handlers/ai-config.ts:1-77`
- Modify: `packages/gateway/src/handlers/index.ts:25` (pass proxy manager to handler registration)
- Test: `packages/gateway/tests/handlers/ai-config.test.ts` (new)

**Step 1: Write the failing test**

```typescript
// packages/gateway/tests/handlers/ai-config.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "../../src/db/schema.js";
import { pushSchema } from "../../src/db/migrate.js";
import { Router } from "../../src/infra/router.js";
import { registerAIConfigHandlers } from "../../src/handlers/ai-config.js";
import { ProxyManager } from "../../src/infra/proxy-manager.js";

// Mock ProxyManager so tests don't spawn real processes
vi.mock("../../src/infra/proxy-manager.js", () => {
  const MockProxyManager = vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue("http://localhost:3456/v1"),
    stop: vi.fn().mockResolvedValue(undefined),
    isRunning: vi.fn().mockReturnValue(false),
    getStatus: vi.fn().mockReturnValue({
      running: false,
      url: null,
      error: null,
    }),
  }));
  return { ProxyManager: MockProxyManager };
});

function setup() {
  const sqlite = new Database(":memory:");
  sqliteVec.load(sqlite);
  pushSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const router = new Router();
  const proxyManager = new ProxyManager();
  registerAIConfigHandlers(router, proxyManager);
  return { db, router, proxyManager };
}

describe("ai-config handlers", () => {
  let db: ReturnType<typeof drizzle>;
  let router: Router;
  let proxyManager: ProxyManager;

  beforeEach(() => {
    ({ db, router, proxyManager } = setup());
    vi.clearAllMocks();
  });

  it("returns defaults when no config exists", async () => {
    const result = (await router.handle(db, "ai-config.get", undefined)) as Record<string, unknown>;
    expect(result.provider).toBe("api-key");
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("starts proxy when switching to claude-max", async () => {
    const result = (await router.handle(db, "ai-config.update", {
      provider: "claude-max",
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(proxyManager.start).toHaveBeenCalled();
  });

  it("stops proxy when switching away from claude-max", async () => {
    // First switch to claude-max
    await router.handle(db, "ai-config.update", { provider: "claude-max" });
    vi.clearAllMocks();

    // Then switch back to api-key
    const result = (await router.handle(db, "ai-config.update", {
      provider: "api-key",
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(proxyManager.stop).toHaveBeenCalled();
  });

  it("includes proxy status in update response", async () => {
    const result = (await router.handle(db, "ai-config.update", {
      provider: "claude-max",
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("proxyStatus");
  });

  it("returns proxy status from ai-config.get", async () => {
    const result = (await router.handle(db, "ai-config.get", undefined)) as Record<string, unknown>;
    expect(result).toHaveProperty("proxyStatus");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/gateway && npx vitest run tests/handlers/ai-config.test.ts`
Expected: FAIL — `registerAIConfigHandlers` doesn't accept a ProxyManager argument yet

**Step 3: Update the handler**

Update `packages/gateway/src/handlers/ai-config.ts` to accept and use a ProxyManager:

```typescript
// packages/gateway/src/handlers/ai-config.ts
import { aiConfig } from "../db/schema.js";
import {
  setAIConfig,
  getAIConfig,
  type AIProviderConfig,
} from "../agents/model-provider.js";
import type { Router, Db } from "../infra/router.js";
import type { ProxyManager } from "../infra/proxy-manager.js";

export function registerAIConfigHandlers(
  router: Router,
  proxyManager: ProxyManager,
) {
  router.register("ai-config.get", async (db: Db) => {
    const [row] = await db.select().from(aiConfig);
    const config = row
      ? {
          provider: row.provider,
          model: row.model,
          proxyUrl: row.proxyUrl,
          hasApiKey: !!process.env.ANTHROPIC_API_KEY,
        }
      : {
          ...getAIConfig(),
          hasApiKey: !!process.env.ANTHROPIC_API_KEY,
        };
    return {
      ...config,
      proxyStatus: proxyManager.getStatus(),
    };
  });

  router.register("ai-config.update", async (db: Db, params: unknown) => {
    const data = params as Partial<AIProviderConfig>;
    const [existing] = await db.select().from(aiConfig);

    if (existing) {
      await db.update(aiConfig).set({
        provider: data.provider ?? existing.provider,
        model: data.model ?? existing.model,
        proxyUrl: data.proxyUrl ?? existing.proxyUrl,
      });
    } else {
      await db.insert(aiConfig).values({
        provider: data.provider ?? "api-key",
        model: data.model ?? "claude-sonnet-4-20250514",
        proxyUrl: data.proxyUrl ?? "http://localhost:3456/v1",
      });
    }

    // Update in-memory config
    const [updated] = await db.select().from(aiConfig);
    if (updated) {
      setAIConfig({
        provider: updated.provider as AIProviderConfig["provider"],
        model: updated.model,
        proxyUrl: updated.proxyUrl,
      });
    }

    // Manage proxy lifecycle based on provider change
    const newProvider = updated?.provider ?? data.provider;
    let proxyError: string | null = null;

    if (newProvider === "claude-max") {
      try {
        await proxyManager.start();
      } catch (err) {
        proxyError =
          err instanceof Error ? err.message : "Failed to start proxy";
      }
    } else {
      await proxyManager.stop();
    }

    return {
      ok: true,
      proxyStatus: proxyManager.getStatus(),
      proxyError,
    };
  });

  router.register("ai-config.check", async (_db: Db, params: unknown) => {
    const { proxyUrl } = (params as { proxyUrl?: string }) ?? {};
    const url = proxyUrl ?? getAIConfig().proxyUrl;

    try {
      const res = await fetch(`${url}/models`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        return { connected: true, models: data };
      }
      return { connected: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  });
}
```

**Step 4: Update `handlers/index.ts` to pass ProxyManager through**

Update the call site in `packages/gateway/src/handlers/index.ts` to accept and forward a ProxyManager:

```typescript
import type { ProxyManager } from "../infra/proxy-manager.js";

export function registerAllHandlers(router: Router, proxyManager: ProxyManager) {
  // ... existing handlers unchanged ...
  registerAIConfigHandlers(router, proxyManager);
  // ... rest unchanged ...
}
```

**Step 5: Run tests to verify they pass**

Run: `cd packages/gateway && npx vitest run tests/handlers/ai-config.test.ts`
Expected: PASS (5 tests)

**Step 6: Commit**

```bash
git add packages/gateway/src/handlers/ai-config.ts packages/gateway/src/handlers/index.ts packages/gateway/tests/handlers/ai-config.test.ts
git commit -m "feat: integrate ProxyManager into ai-config handlers"
```

---

### Task 4: Wire proxy into gateway startup and shutdown

**Files:**
- Modify: `packages/gateway/src/index.ts:1-126`
- Modify: `packages/gateway/src/agents/model-provider.ts:51-54`

**Step 1: Update `model-provider.ts` — `hasAIProvider` checks proxy**

Replace the `hasAIProvider` function to accept an optional proxy running check:

```typescript
// In model-provider.ts, replace hasAIProvider:
export function hasAIProvider(isProxyRunning?: boolean): boolean {
  if (currentConfig.provider === "claude-max") {
    return isProxyRunning ?? false;
  }
  return !!process.env.ANTHROPIC_API_KEY;
}
```

**Step 2: Update `index.ts` — create ProxyManager, start on boot, clean up on shutdown**

Key changes to `packages/gateway/src/index.ts`:

1. Import and instantiate `ProxyManager`
2. Pass it to `registerAllHandlers`
3. After loading AI config, if provider is `claude-max`, call `proxyManager.start()`
4. Pass `proxyManager.isRunning()` to `hasAIProvider()`
5. Add `proxyManager.stop()` as first step in the `stop()` cleanup function
6. Add `process.on('exit')` safety net

```typescript
// Add import at top:
import { ProxyManager } from "./infra/proxy-manager.js";

// In startGateway(), after router creation (step 5):
const proxyManager = new ProxyManager();
registerAllHandlers(router, proxyManager);

// In step 8, after loading saved AI config and calling setAIConfig():
if (savedAiConfig?.provider === "claude-max") {
  try {
    await proxyManager.start();
    console.log("Claude Max proxy started");
  } catch (err) {
    console.error("Failed to start Claude Max proxy:", err);
  }
}

// Update the hasAIProvider call:
const useRealAgents = hasAIProvider(proxyManager.isRunning());

// Update stop() to kill proxy first:
async function stop() {
  await proxyManager.stop();
  heartbeat.stop();
  await orchestrator.waitForDrain(30_000);
  await wsServer.close();
  sqlite.close();
}

// Safety net — kill proxy if gateway crashes:
process.on("exit", () => {
  if (proxyManager.isRunning()) {
    proxyManager.stop();
  }
});
```

**Step 3: Run existing tests to verify nothing breaks**

Run: `cd packages/gateway && npx vitest run`
Expected: All existing tests PASS

**Step 4: Commit**

```bash
git add packages/gateway/src/index.ts packages/gateway/src/agents/model-provider.ts
git commit -m "feat: wire proxy into gateway startup/shutdown lifecycle"
```

---

### Task 5: Update the UI — remove manual instructions, add status

**Files:**
- Modify: `packages/app/src/renderer/components/settings/AIProviderSetup.tsx:1-199`

**Step 1: Update the component**

Key UI changes:
1. Remove the proxy URL text input (use the default, no need to configure)
2. Remove the "Test" button (proxy is auto-managed)
3. Remove the "Run `npx claude-max-api-proxy`" instructions
4. Add a proxy status indicator showing running/starting/error state
5. Add instructions for installing Claude Code CLI (the actual prerequisite)
6. When saving with `claude-max`, show the proxy status from the response

```tsx
// packages/app/src/renderer/components/settings/AIProviderSetup.tsx
import { useState, useEffect } from "react";
import { wsClient } from "../../lib/ws-client";

interface ProxyStatus {
  running: boolean;
  url: string | null;
  error: string | null;
}

interface AIConfig {
  provider: "api-key" | "claude-max";
  model: string;
  proxyUrl: string;
  hasApiKey: boolean;
  proxyStatus: ProxyStatus;
}

const MODELS = [
  "claude-sonnet-4-20250514",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-20250514",
];

export function AIProviderSetup() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [provider, setProvider] = useState<"api-key" | "claude-max">(
    "api-key",
  );
  const [saving, setSaving] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>({
    running: false,
    url: null,
    error: null,
  });
  const [proxyError, setProxyError] = useState<string | null>(null);

  useEffect(() => {
    wsClient
      .request<AIConfig>("ai-config.get")
      .then((cfg) => {
        setConfig(cfg);
        setProvider(cfg.provider);
        setModel(cfg.model);
        setProxyStatus(cfg.proxyStatus);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setProxyError(null);
    try {
      const result = await wsClient.request<{
        ok: boolean;
        proxyStatus: ProxyStatus;
        proxyError?: string;
      }>("ai-config.update", { provider, model });

      setProxyStatus(result.proxyStatus);
      if (result.proxyError) {
        setProxyError(result.proxyError);
      }
      setConfig((prev) =>
        prev
          ? { ...prev, provider, model, proxyStatus: result.proxyStatus }
          : prev,
      );
    } finally {
      setSaving(false);
    }
  }

  if (!config) return null;

  const dirty = provider !== config.provider || model !== config.model;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">AI Provider</h2>
      <div className="space-y-4">
        {/* Provider selection */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <input
              type="radio"
              name="ai-provider"
              checked={provider === "api-key"}
              onChange={() => setProvider("api-key")}
              className="accent-indigo-500"
            />
            <div>
              <p className="text-sm font-medium text-white">
                Anthropic API Key
              </p>
              <p className="text-xs text-gray-400">
                Uses ANTHROPIC_API_KEY environment variable
              </p>
              {provider === "api-key" && (
                <p
                  className={`text-xs mt-1 ${config.hasApiKey ? "text-green-400" : "text-yellow-400"}`}
                >
                  {config.hasApiKey
                    ? "API key detected"
                    : "No API key found — set ANTHROPIC_API_KEY"}
                </p>
              )}
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <input
              type="radio"
              name="ai-provider"
              checked={provider === "claude-max"}
              onChange={() => setProvider("claude-max")}
              className="accent-indigo-500"
            />
            <div>
              <p className="text-sm font-medium text-white">
                Claude Max Subscription
              </p>
              <p className="text-xs text-gray-400">
                Uses your Claude subscription (no API costs)
              </p>
            </div>
          </label>
        </div>

        {/* Claude Max status and instructions */}
        {provider === "claude-max" && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            {/* Proxy status */}
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  proxyStatus.running
                    ? "bg-green-400"
                    : proxyError || proxyStatus.error
                      ? "bg-red-400"
                      : "bg-gray-500"
                }`}
              />
              <p className="text-xs text-gray-400">
                {proxyStatus.running
                  ? "Proxy running"
                  : saving
                    ? "Starting proxy..."
                    : "Proxy not running"}
              </p>
            </div>

            {/* Error message */}
            {(proxyError || proxyStatus.error) && (
              <p className="text-xs text-red-400">
                {proxyError ?? proxyStatus.error}
              </p>
            )}

            {/* Prerequisites */}
            <div className="border-t border-white/5 pt-2 mt-2">
              <p className="text-xs font-medium text-gray-300 mb-1">
                Requires Claude Code CLI
              </p>
              <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                <li>
                  Install:{" "}
                  <code className="rounded bg-white/10 px-1">
                    npm install -g @anthropic-ai/claude-code
                  </code>
                </li>
                <li>
                  Authenticate:{" "}
                  <code className="rounded bg-white/10 px-1">
                    claude auth login
                  </code>
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Model selector */}
        <div className="space-y-2">
          <label className="block text-sm text-gray-400">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Save button */}
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify the app builds**

Run: `cd packages/app && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/app/src/renderer/components/settings/AIProviderSetup.tsx
git commit -m "feat: update AI provider UI with auto-proxy status and CLI instructions"
```

---

### Task 6: Run full test suite and verify

**Step 1: Run all gateway tests**

Run: `cd packages/gateway && npx vitest run`
Expected: All tests PASS (existing + new ai-config tests)

**Step 2: Run full build**

Run: `npm run build --workspaces`
Expected: All packages build successfully

**Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: address test/build issues from proxy integration"
```
