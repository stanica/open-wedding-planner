/**
 * Unified context manager — coordinates history truncation, pruning, and compaction.
 */
import { HistoryManager, type HistoryEntry, type HistoryConfig } from "./history.js";
import { pruneHistory, type PruningConfig } from "./pruning.js";
import { compactHistory, type SummarizeFn, type CompactionConfig } from "./compaction.js";

export interface ContextManagerConfig {
  history?: Partial<HistoryConfig>;
  pruning?: Partial<PruningConfig>;
  compaction?: Partial<CompactionConfig>;
}

export class ContextManager {
  private historyManager: HistoryManager;
  private pruningConfig: Partial<PruningConfig>;
  private compactionConfig: Partial<CompactionConfig>;
  private summarizeFn: SummarizeFn | null = null;

  constructor(config?: ContextManagerConfig) {
    this.historyManager = new HistoryManager(config?.history);
    this.pruningConfig = config?.pruning ?? {};
    this.compactionConfig = config?.compaction ?? {};
  }

  setSummarizeFn(fn: SummarizeFn): void {
    this.summarizeFn = fn;
  }

  append(sessionKey: string, entry: HistoryEntry): void {
    this.historyManager.append(sessionKey, entry);
  }

  get(sessionKey: string): HistoryEntry[] {
    return this.historyManager.get(sessionKey);
  }

  clear(sessionKey: string): void {
    this.historyManager.clear(sessionKey);
  }

  getTokenEstimate(sessionKey: string): number {
    return this.historyManager.getTokenEstimate(sessionKey);
  }

  /**
   * Run the full context management pipeline for a session.
   * Returns a description of what was done.
   */
  async manage(sessionKey: string): Promise<string> {
    const history = this.historyManager.get(sessionKey);
    if (history.length === 0) return "empty";

    // Layer 1: History truncation (already handled by append())

    // Layer 2: Pruning
    const pruneResult = pruneHistory(history, this.pruningConfig);
    if (pruneResult.action === "hard-clear") {
      return `hard-clear: removed ${pruneResult.removedEntries} entries, ${pruneResult.tokensBefore} → ${pruneResult.tokensAfter} tokens`;
    }
    if (pruneResult.action === "soft-trim") {
      return `soft-trim: trimmed ${pruneResult.removedEntries} tool results, ${pruneResult.tokensBefore} → ${pruneResult.tokensAfter} tokens`;
    }

    // Layer 3: Compaction (only if summarize function is available)
    if (this.summarizeFn) {
      const compactResult = await compactHistory(
        history,
        this.summarizeFn,
        this.compactionConfig,
      );
      if (compactResult.compacted) {
        return `compacted: summarized ${compactResult.removedEntries} entries, ${compactResult.tokensBefore} → ${compactResult.tokensAfter} tokens`;
      }
    }

    return "no-action";
  }
}
