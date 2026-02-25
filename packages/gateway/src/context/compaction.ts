/**
 * Layer 3: Context compaction — when pruning isn't enough, LLM-summarize
 * older chunks. Uses 1.2x safety margin on token estimates.
 */
import type { HistoryEntry } from "./history.js";
import { estimateTokens } from "./history.js";

export interface CompactionConfig {
  contextWindowTokens: number;
  targetUtilization: number; // Target after compaction (default 0.5)
  safetyMargin: number; // Multiplier for token estimates (default 1.2)
}

const DEFAULT_CONFIG: CompactionConfig = {
  contextWindowTokens: 100_000,
  targetUtilization: 0.5,
  safetyMargin: 1.2,
};

export type SummarizeFn = (text: string) => Promise<string>;

export interface CompactResult {
  compacted: boolean;
  summaryEntry: HistoryEntry | null;
  removedEntries: number;
  tokensBefore: number;
  tokensAfter: number;
}

/**
 * Compact history by summarizing older entries when context is too large.
 *
 * @param history - Mutable array of history entries
 * @param summarize - Function that calls LLM to summarize text
 * @param config - Compaction configuration
 */
export async function compactHistory(
  history: HistoryEntry[],
  summarize: SummarizeFn,
  config?: Partial<CompactionConfig>,
): Promise<CompactResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const totalTokens = history.reduce(
    (sum, e) => sum + ((e.tokenEstimate ?? estimateTokens(e.content)) * cfg.safetyMargin),
    0,
  );

  const targetTokens = cfg.contextWindowTokens * cfg.targetUtilization;

  // No compaction needed
  if (totalTokens <= cfg.contextWindowTokens * 0.8) {
    return {
      compacted: false,
      summaryEntry: null,
      removedEntries: 0,
      tokensBefore: totalTokens,
      tokensAfter: totalTokens,
    };
  }

  // Calculate how many entries to summarize (from the start)
  // Keep enough recent entries to be under target
  let tokensFromEnd = 0;
  let keepFrom = history.length;
  for (let i = history.length - 1; i >= 0; i--) {
    const entryTokens =
      (history[i].tokenEstimate ?? estimateTokens(history[i].content)) * cfg.safetyMargin;
    if (tokensFromEnd + entryTokens > targetTokens) {
      keepFrom = i + 1;
      break;
    }
    tokensFromEnd += entryTokens;
    keepFrom = i;
  }

  // Need at least some entries to summarize
  if (keepFrom <= 1) {
    return {
      compacted: false,
      summaryEntry: null,
      removedEntries: 0,
      tokensBefore: totalTokens,
      tokensAfter: totalTokens,
    };
  }

  // Build text to summarize
  const entriesToSummarize = history.slice(0, keepFrom);
  const textToSummarize = entriesToSummarize
    .map((e) => `[${e.role}]: ${e.content}`)
    .join("\n\n");

  // Summarize via LLM
  const summary = await summarize(textToSummarize);

  // Create summary entry
  const summaryEntry: HistoryEntry = {
    role: "assistant",
    content: `[Context summary]: ${summary}`,
    timestamp: Date.now(),
    tokenEstimate: estimateTokens(summary),
  };

  // Replace old entries with summary
  const removedCount = keepFrom;
  history.splice(0, keepFrom, summaryEntry);

  const tokensAfter = history.reduce(
    (sum, e) => sum + ((e.tokenEstimate ?? estimateTokens(e.content)) * cfg.safetyMargin),
    0,
  );

  return {
    compacted: true,
    summaryEntry,
    removedEntries: removedCount,
    tokensBefore: totalTokens,
    tokensAfter,
  };
}
