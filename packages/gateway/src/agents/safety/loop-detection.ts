import { createHash } from "crypto";

export class LoopDetectedError extends Error {
  constructor(
    public readonly pattern: string,
    public readonly count: number,
  ) {
    super(`Loop detected: "${pattern}" repeated ${count} times`);
    this.name = "LoopDetectedError";
  }
}

export class LoopWarning {
  constructor(
    public readonly pattern: string,
    public readonly count: number,
  ) {}
}

export interface LoopDetectionConfig {
  windowSize?: number;
  warnThreshold?: number;
  blockThreshold?: number;
  globalBreaker?: number;
}

const DEFAULTS: Required<LoopDetectionConfig> = {
  windowSize: 30,
  warnThreshold: 10,
  blockThreshold: 20,
  globalBreaker: 30,
};

export class LoopDetector {
  private window: string[] = [];
  private counts = new Map<string, number>();
  private totalCalls = 0;
  private readonly config: Required<LoopDetectionConfig>;

  constructor(config?: LoopDetectionConfig) {
    this.config = { ...DEFAULTS, ...config };
  }

  record(toolName: string, params: unknown): LoopWarning | null {
    this.totalCalls++;

    if (this.totalCalls > this.config.globalBreaker) {
      throw new LoopDetectedError(
        "global",
        this.totalCalls,
      );
    }

    const hash = this.hash(toolName, params);

    // Maintain sliding window
    this.window.push(hash);
    if (this.window.length > this.config.windowSize) {
      const removed = this.window.shift()!;
      const oldCount = this.counts.get(removed) ?? 0;
      if (oldCount <= 1) {
        this.counts.delete(removed);
      } else {
        this.counts.set(removed, oldCount - 1);
      }
    }

    const newCount = (this.counts.get(hash) ?? 0) + 1;
    this.counts.set(hash, newCount);

    if (newCount >= this.config.blockThreshold) {
      throw new LoopDetectedError(`${toolName}(...)`, newCount);
    }

    if (newCount >= this.config.warnThreshold) {
      return new LoopWarning(`${toolName}(...)`, newCount);
    }

    return null;
  }

  getTotalCalls(): number {
    return this.totalCalls;
  }

  reset(): void {
    this.window = [];
    this.counts.clear();
    this.totalCalls = 0;
  }

  private hash(toolName: string, params: unknown): string {
    const input = `${toolName}:${JSON.stringify(params)}`;
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
  }
}
