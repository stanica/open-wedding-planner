import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";

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

  /**
   * Resolve the claude-max-api binary path.
   * Uses createRequire to find the package, which works regardless of
   * whether the dependency is hoisted to the workspace root or local.
   */
  private resolveBin(): string {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve("claude-max-api-proxy/package.json");
    // pkgJson is e.g. .../node_modules/claude-max-api-proxy/package.json
    const pkgDir = pkgJson.replace(/\/package\.json$/, "");
    return `${pkgDir}/dist/server/standalone.js`;
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
