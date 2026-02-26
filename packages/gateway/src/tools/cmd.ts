import { tool } from "ai";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PermissionCallbacks } from "./permission-wrapper.js";

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB

export const CMD_BLACKLIST = [
  "rm", "rmdir", "mv", "kill", "killall", "pkill",
  "chmod", "chown", "mkfs", "dd", "shred",
];

export function isBlacklisted(command: string): boolean {
  const base = command.split("/").pop() ?? command;
  return CMD_BLACKLIST.includes(base);
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_BYTES) return text;
  return text.slice(0, MAX_OUTPUT_BYTES) + "\n...[output truncated]";
}

export function createCmdTool(workspaceDir: string, permissionCallbacks: PermissionCallbacks) {
  return tool({
    description:
      "Execute a command-line program. The working directory is a fixed workspace. Use this for file operations, running scripts, data processing, or any CLI task.",
    inputSchema: z.object({
      command: z.string().describe("The program to execute (e.g. 'ls', 'node', 'python3')"),
      args: z.array(z.string()).optional().default([]).describe("Arguments to pass to the program"),
      timeout: z.number().optional().default(30000).describe("Timeout in milliseconds"),
    }),
    execute: async ({ command, args, timeout }) => {
      if (isBlacklisted(command)) {
        const fullCmd = [command, ...args].join(" ");
        const response = await permissionCallbacks.requestPermission(`cmd:${command}`, fullCmd);
        if (response === "deny") {
          return { error: `Command "${command}" denied by user. Try an alternative approach.` };
        }
      }

      try {
        const { stdout, stderr } = await execFileAsync(command, args, {
          cwd: workspaceDir,
          timeout,
          maxBuffer: MAX_OUTPUT_BYTES * 2,
        });
        return { stdout: truncate(stdout), stderr: truncate(stderr) };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  });
}
