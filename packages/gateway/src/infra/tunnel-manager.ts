import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";

export type TunnelStatus =
  | { state: "stopped" }
  | { state: "starting" }
  | { state: "running"; url: string }
  | { state: "error"; message: string };

type StatusListener = (status: TunnelStatus) => void;

// cloudflared prints the public URL before the tunnel is fully connected.
// We capture the URL first, then wait for the "Registered tunnel connection"
// line before marking the tunnel as running.
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const CONNECTED_PATTERN =
  /Registered tunnel connection|Connection .* registered/i;

export class TunnelManager {
  private process: ChildProcess | null = null;
  private status: TunnelStatus = { state: "stopped" };
  private listeners = new Set<StatusListener>();
  private binPath: string;

  constructor(binPath: string) {
    this.binPath = binPath;
  }

  getStatus(): TunnelStatus {
    return this.status;
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: TunnelStatus) {
    this.status = status;
    for (const l of this.listeners) l(status);
  }

  async start(port: number): Promise<void> {
    if (this.process) return;
    if (!fs.existsSync(this.binPath)) {
      this.setStatus({
        state: "error",
        message: "cloudflared binary not found",
      });
      return;
    }

    this.setStatus({ state: "starting" });

    const child = spawn(
      this.binPath,
      ["tunnel", "--url", `http://localhost:${port}`],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    this.process = child;

    let pendingUrl: string | null = null;

    const onData = (data: Buffer) => {
      const text = data.toString();
      const urlMatch = text.match(URL_PATTERN);
      if (urlMatch) pendingUrl = urlMatch[0];

      // Only mark as running once the connection is actually registered
      if (pendingUrl && CONNECTED_PATTERN.test(text)) {
        this.setStatus({ state: "running", url: pendingUrl });
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (err) => {
      this.process = null;
      this.setStatus({ state: "error", message: err.message });
    });

    child.on("exit", (code) => {
      this.process = null;
      if (this.status.state !== "stopped") {
        this.setStatus(
          code === 0 || code === null
            ? { state: "stopped" }
            : {
                state: "error",
                message: `cloudflared exited with code ${code}`,
              },
        );
      }
    });
  }

  async stop(): Promise<void> {
    const proc = this.process;
    if (!proc) {
      this.setStatus({ state: "stopped" });
      return;
    }
    this.process = null;
    this.setStatus({ state: "stopped" });

    return new Promise((resolve) => {
      const t = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 5000);
      proc.on("exit", () => {
        clearTimeout(t);
        resolve();
      });
      proc.kill("SIGTERM");
    });
  }

  killSync(): void {
    try {
      this.process?.kill("SIGKILL");
    } catch {
      /* already dead */
    }
    this.process = null;
  }
}
