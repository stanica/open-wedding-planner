import fs from "node:fs";
import path from "node:path";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

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
      throw new Error(
        `Failed to download gog: ${response.status} ${response.statusText}`,
      );
    }

    const tmpFile = path.join(this.dir, asset);
    const fileStream = createWriteStream(tmpFile);
    await pipeline(response.body as any, fileStream);

    // Extract tar.gz (macOS/Linux)
    if (asset.endsWith(".tar.gz")) {
      await execFileAsync("tar", ["xzf", tmpFile, "-C", this.dir]);
    } else {
      // .zip for Windows
      await execFileAsync("unzip", ["-o", tmpFile, "-d", this.dir]);
    }

    // The extracted binary is named "gogcli" or "gogcli.exe" — rename to "gog"
    const extractedName =
      process.platform === "win32" ? "gogcli.exe" : "gogcli";
    const targetName = process.platform === "win32" ? "gog.exe" : "gog";
    const extractedPath = path.join(this.dir, extractedName);
    const targetPath = path.join(this.dir, targetName);
    if (fs.existsSync(extractedPath) && (extractedName as string) !== (targetName as string)) {
      fs.renameSync(extractedPath, targetPath);
    }

    // Make executable on unix
    if (process.platform !== "win32") {
      fs.chmodSync(targetPath, 0o755);
    }

    // Write version marker
    fs.writeFileSync(path.join(this.dir, ".version"), GogManager.GOG_VERSION);

    // Clean up archive
    fs.unlinkSync(tmpFile);

    console.log(`gog ${GogManager.GOG_VERSION} installed to ${targetPath}`);
  }

  getAssetName(platform: string, arch: string): string {
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
    return execFileAsync(binPath, args, {
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });
  }

  /** Spawn gog as a long-lived child process (for interactive flows like --manual) */
  async spawnProcess(args: string[]): Promise<ChildProcess> {
    const binPath = await this.ensureInstalled();
    return spawn(binPath, args, { stdio: ["pipe", "pipe", "pipe"] });
  }
}
