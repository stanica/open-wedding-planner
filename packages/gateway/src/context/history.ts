/**
 * Layer 1: History truncation — sliding window, keep last N turns per session.
 */
export interface HistoryEntry {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  tokenEstimate?: number;
}

export interface HistoryConfig {
  maxTurns: number;
}

const DEFAULT_CONFIG: HistoryConfig = {
  maxTurns: 30,
};

export class HistoryManager {
  private histories = new Map<string, HistoryEntry[]>();
  private config: HistoryConfig;

  constructor(config?: Partial<HistoryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  append(sessionKey: string, entry: HistoryEntry): void {
    if (!this.histories.has(sessionKey)) {
      this.histories.set(sessionKey, []);
    }
    const history = this.histories.get(sessionKey)!;
    history.push(entry);

    // Sliding window: trim to maxTurns
    if (history.length > this.config.maxTurns) {
      const excess = history.length - this.config.maxTurns;
      history.splice(0, excess);
    }
  }

  get(sessionKey: string): HistoryEntry[] {
    return this.histories.get(sessionKey) ?? [];
  }

  clear(sessionKey: string): void {
    this.histories.delete(sessionKey);
  }

  getTokenEstimate(sessionKey: string): number {
    const history = this.histories.get(sessionKey) ?? [];
    return history.reduce((sum, e) => sum + (e.tokenEstimate ?? estimateTokens(e.content)), 0);
  }

  truncateTo(sessionKey: string, maxTurns: number): HistoryEntry[] {
    const history = this.histories.get(sessionKey) ?? [];
    if (history.length <= maxTurns) return [];

    const removed = history.splice(0, history.length - maxTurns);
    return removed;
  }
}

/**
 * Rough token estimation: ~4 chars per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
