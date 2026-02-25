import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { GATEWAY_READY_PREFIX } from "@wedding-planner/shared";

let gatewayProcess: ChildProcess | null = null;

export function spawnGateway(): Promise<number> {
  return new Promise((resolve, reject) => {
    const gatewayPath = path.join(
      __dirname,
      "../../..",
      "gateway/dist/index.js",
    );

    gatewayProcess = fork(gatewayPath, [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: { ...process.env },
    });

    const timeout = setTimeout(() => {
      reject(new Error("Gateway startup timed out"));
    }, 10000);

    gatewayProcess.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line.startsWith(GATEWAY_READY_PREFIX)) {
        clearTimeout(timeout);
        const port = parseInt(line.slice(GATEWAY_READY_PREFIX.length), 10);
        resolve(port);
      }
    });

    gatewayProcess.stderr?.on("data", (data: Buffer) => {
      console.error("[gateway]", data.toString());
    });

    gatewayProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    gatewayProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Gateway exited with code ${code}`));
      }
      gatewayProcess = null;
    });
  });
}

export async function stopGateway(): Promise<void> {
  if (!gatewayProcess) return;

  const proc = gatewayProcess;
  gatewayProcess = null;

  return new Promise((resolve) => {
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
