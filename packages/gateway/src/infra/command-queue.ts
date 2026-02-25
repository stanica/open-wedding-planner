type TaskFn = () => Promise<void>;

interface QueuedTask {
  id: string;
  fn: TaskFn;
}

export interface LaneConfig {
  maxConcurrent: number;
}

export class Lane {
  readonly name: string;
  readonly maxConcurrent: number;
  private activeTaskIds = new Set<string>();
  private queue: QueuedTask[] = [];
  private generation = 0;

  constructor(name: string, config: LaneConfig) {
    this.name = name;
    this.maxConcurrent = config.maxConcurrent;
  }

  getGeneration(): number {
    return this.generation;
  }

  getActiveCount(): number {
    return this.activeTaskIds.size;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isActive(taskId: string): boolean {
    return this.activeTaskIds.has(taskId);
  }

  async enqueue(taskId: string, fn: TaskFn): Promise<void> {
    if (this.activeTaskIds.size < this.maxConcurrent) {
      await this.runTask(taskId, fn);
    } else {
      return new Promise<void>((resolve, reject) => {
        this.queue.push({
          id: taskId,
          fn: async () => {
            try {
              await fn();
              resolve();
            } catch (err) {
              reject(err);
            }
          },
        });
      });
    }
  }

  complete(taskId: string, generation: number): boolean {
    if (generation !== this.generation) {
      return false;
    }
    if (!this.activeTaskIds.has(taskId)) {
      return false;
    }
    this.activeTaskIds.delete(taskId);
    this.drain();
    return true;
  }

  cancel(taskId: string): boolean {
    if (this.activeTaskIds.has(taskId)) {
      this.activeTaskIds.delete(taskId);
      this.generation++;
      this.drain();
      return true;
    }
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  clearQueue(): void {
    this.queue = [];
  }

  reset(): void {
    this.activeTaskIds.clear();
    this.queue = [];
    this.generation++;
  }

  private async runTask(taskId: string, fn: TaskFn): Promise<void> {
    this.activeTaskIds.add(taskId);
    const gen = this.generation;
    try {
      await fn();
    } finally {
      this.complete(taskId, gen);
    }
  }

  private drain(): void {
    while (this.queue.length > 0 && this.activeTaskIds.size < this.maxConcurrent) {
      const next = this.queue.shift()!;
      this.activeTaskIds.add(next.id);
      const gen = this.generation;
      next.fn().finally(() => {
        this.complete(next.id, gen);
      });
    }
  }
}

export interface CommandQueueConfig {
  lanes?: Record<string, LaneConfig>;
}

const DEFAULT_LANES: Record<string, LaneConfig> = {
  main: { maxConcurrent: 1 },
  heartbeat: { maxConcurrent: 1 },
  subagent: { maxConcurrent: 3 },
};

export class CommandQueue {
  private lanes: Map<string, Lane>;

  constructor(config?: CommandQueueConfig) {
    const laneConfigs = config?.lanes ?? DEFAULT_LANES;
    this.lanes = new Map();
    for (const [name, cfg] of Object.entries(laneConfigs)) {
      this.lanes.set(name, new Lane(name, cfg));
    }
  }

  getLane(name: string): Lane {
    const lane = this.lanes.get(name);
    if (!lane) throw new Error(`Unknown lane: ${name}`);
    return lane;
  }

  async enqueue(laneName: string, taskId: string, fn: TaskFn): Promise<void> {
    return this.getLane(laneName).enqueue(taskId, fn);
  }

  cancel(laneName: string, taskId: string): boolean {
    return this.getLane(laneName).cancel(taskId);
  }

  reset(): void {
    for (const lane of this.lanes.values()) {
      lane.reset();
    }
  }

  /**
   * Wait for all in-flight tasks to complete (max 30s).
   * Clears queued tasks immediately so no new work starts.
   */
  async waitForDrain(maxWaitMs = 30_000): Promise<void> {
    // Clear queued (not yet started) tasks
    for (const lane of this.lanes.values()) {
      lane.clearQueue();
    }

    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const totalActive = Array.from(this.lanes.values()).reduce(
        (sum, lane) => sum + lane.getActiveCount(),
        0,
      );
      if (totalActive === 0) return;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  getStatus(): Record<string, { active: number; queued: number; generation: number }> {
    const result: Record<string, { active: number; queued: number; generation: number }> = {};
    for (const [name, lane] of this.lanes) {
      result[name] = {
        active: lane.getActiveCount(),
        queued: lane.getQueueLength(),
        generation: lane.getGeneration(),
      };
    }
    return result;
  }
}
