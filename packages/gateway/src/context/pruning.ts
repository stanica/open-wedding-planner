/**
 * Layer 2: Context pruning — at 80% of context window, soft-trim old tool results.
 * At 95%, hard-clear everything except the last few turns.
 */
import type { HistoryEntry } from "./history.js";
import { estimateTokens } from "./history.js";

export interface PruningConfig {
  contextWindowTokens: number;
  softTrimThreshold: number; // 0-1, default 0.8
  hardClearThreshold: number; // 0-1, default 0.95
  keepMinTurns: number; // Minimum turns to keep even on hard-clear
}

const DEFAULT_CONFIG: PruningConfig = {
  contextWindowTokens: 100_000,
  softTrimThreshold: 0.8,
  hardClearThreshold: 0.95,
  keepMinTurns: 5,
};

export interface PruneResult {
  action: "none" | "soft-trim" | "hard-clear";
  removedEntries: number;
  tokensBefore: number;
  tokensAfter: number;
}

export function pruneHistory(
  history: HistoryEntry[],
  config?: Partial<PruningConfig>,
): PruneResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const totalTokens = history.reduce(
    (sum, e) => sum + (e.tokenEstimate ?? estimateTokens(e.content)),
    0,
  );

  const utilization = totalTokens / cfg.contextWindowTokens;

  // Below soft threshold: do nothing
  if (utilization < cfg.softTrimThreshold) {
    return {
      action: "none",
      removedEntries: 0,
      tokensBefore: totalTokens,
      tokensAfter: totalTokens,
    };
  }

  // Above hard threshold: keep only the last keepMinTurns entries
  if (utilization >= cfg.hardClearThreshold) {
    const removedCount = Math.max(0, history.length - cfg.keepMinTurns);
    const removed = history.splice(0, removedCount);
    const tokensAfter = history.reduce(
      (sum, e) => sum + (e.tokenEstimate ?? estimateTokens(e.content)),
      0,
    );
    return {
      action: "hard-clear",
      removedEntries: removed.length,
      tokensBefore: totalTokens,
      tokensAfter,
    };
  }

  // Soft trim: remove tool results from older entries (keep the last 1/3)
  const softTrimBoundary = Math.floor(history.length * (2 / 3));
  let removedEntries = 0;
  let tokensRemoved = 0;

  for (let i = 0; i < softTrimBoundary; i++) {
    const entry = history[i];
    if (entry.role === "tool") {
      const tokens = entry.tokenEstimate ?? estimateTokens(entry.content);
      // Replace tool output with a short summary marker
      entry.content = "[tool result trimmed]";
      entry.tokenEstimate = estimateTokens(entry.content);
      tokensRemoved += tokens - entry.tokenEstimate;
      removedEntries++;
    }
  }

  return {
    action: "soft-trim",
    removedEntries,
    tokensBefore: totalTokens,
    tokensAfter: totalTokens - tokensRemoved,
  };
}
