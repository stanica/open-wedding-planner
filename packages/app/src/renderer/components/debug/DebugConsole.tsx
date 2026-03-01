import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { wsClient } from "../../lib/ws-client";
import { useDebugStore, type LogSource } from "../../stores/debug-store";
import type { GatewayEvent } from "@wedding-planner/shared";

const SOURCE_COLORS: Record<LogSource, string> = {
  agent: "text-blue-400",
  gateway: "text-yellow-400",
  ws: "text-green-400",
  renderer: "text-red-400",
};

const SOURCE_BG: Record<LogSource, string> = {
  agent: "bg-blue-400/10",
  gateway: "bg-yellow-400/10",
  ws: "bg-green-400/10",
  renderer: "bg-red-400/10",
};

const FILTER_OPTIONS: Array<{ value: LogSource | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "agent", label: "Agent" },
  { value: "gateway", label: "Gateway" },
  { value: "ws", label: "WebSocket" },
  { value: "renderer", label: "Renderer" },
];

export function DebugConsole() {
  const {
    entries,
    filter,
    searchQuery,
    autoScroll,
    push,
    clear,
    setFilter,
    setSearchQuery,
    setAutoScroll,
  } = useDebugStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);

  // Subscribe to agent events
  useEffect(() => {
    return wsClient.onEvent((event: GatewayEvent) => {
      if (event.name === "agent-activity") {
        push({
          source: "agent",
          timestamp: Date.now(),
          summary: `[${event.data.sessionKey}] ${event.data.action}`,
          detail: event.data.detail,
        });
      } else if (event.name === "agent-complete") {
        push({
          source: "agent",
          timestamp: Date.now(),
          summary: `[${event.data.taskId}] complete`,
          detail: event.data.summary,
        });
      } else {
        push({
          source: "agent",
          timestamp: Date.now(),
          summary: `event: ${event.name}`,
          detail: event.data,
        });
      }
    });
  }, [push]);

  // Subscribe to WebSocket traffic
  useEffect(() => {
    return wsClient.onMessage((direction, msg) => {
      const arrow = direction === "sent" ? "\u2192" : "\u2190";
      const msgObj = msg as Record<string, unknown>;
      push({
        source: "ws",
        timestamp: Date.now(),
        summary: `${arrow} ${msgObj.type ?? "unknown"}${msgObj.method ? `:${msgObj.method}` : ""}${msgObj.id ? ` #${msgObj.id}` : ""}`,
        detail: msg,
      });
    });
  }, [push]);

  // Subscribe to gateway logs
  useEffect(() => {
    // Load buffer first
    window.electronAPI?.getGatewayLogBuffer().then((buffer) => {
      for (const log of buffer) {
        push({
          source: "gateway",
          timestamp: log.timestamp,
          summary: `[${log.level}] ${log.line}`,
        });
      }
    });

    // Then subscribe to live logs
    return window.electronAPI?.onGatewayLog((log) => {
      push({
        source: "gateway",
        timestamp: log.timestamp,
        summary: `[${log.level}] ${log.line}`,
      });
    });
  }, [push]);

  // Capture uncaught renderer errors
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      push({
        source: "renderer",
        timestamp: Date.now(),
        summary: `[error] ${e.message}`,
        detail: e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`,
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason =
        e.reason instanceof Error ? e.reason : { message: String(e.reason) };
      push({
        source: "renderer",
        timestamp: Date.now(),
        summary: `[unhandledrejection] ${reason.message}`,
        detail: (reason as Error).stack,
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [push]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      isAutoScrolling.current = true;
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, autoScroll]);

  // Pause auto-scroll on manual scroll up
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (atBottom) {
      isAutoScrolling.current = false;
    }
    if (!atBottom && autoScroll && !isAutoScrolling.current) {
      setAutoScroll(false);
    }
  }, [autoScroll, setAutoScroll]);

  // Filter and search
  const filtered = useMemo(() => {
    let result = entries;
    if (filter !== "all") {
      result = result.filter((e) => e.source === filter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.summary.toLowerCase().includes(q) ||
          (typeof e.detail === "string" &&
            e.detail.toLowerCase().includes(q)) ||
          (e.detail && JSON.stringify(e.detail).toLowerCase().includes(q)),
      );
    }
    return result;
  }, [entries, filter, searchQuery]);

  return (
    <div className="flex flex-col h-screen bg-surface text-on-surface font-mono text-xs">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-dropdown shrink-0">
        <div className="flex gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                filter === opt.value
                  ? "bg-surface-active text-on-surface"
                  : "text-on-surface-tertiary hover:text-on-surface-secondary hover:bg-surface-hover"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <input
          type="text"
          placeholder="Filter..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-gray-800 border border-border rounded px-2 py-1 text-xs text-on-surface placeholder:text-placeholder w-48 focus:outline-none focus:border-border-hover"
        />

        <button
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            autoScroll ? "text-success" : "text-on-surface-tertiary hover:text-on-surface-secondary"
          }`}
          title="Auto-scroll"
        >
          ↓ Auto
        </button>

        <button
          onClick={clear}
          className="px-2 py-1 rounded text-xs text-on-surface-tertiary hover:text-error hover:bg-surface-hover transition-colors"
        >
          Clear
        </button>

        <span className="text-on-surface-faint text-xs tabular-nums">
          {entries.length}
        </span>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-1"
      >
        {filtered.map((entry) => (
          <LogLine key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function LogLine({
  entry,
}: {
  entry: {
    id: number;
    source: LogSource;
    timestamp: number;
    summary: string;
    detail?: unknown;
  };
}) {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const [open, setOpen] = useState(false);
  const detailStr =
    entry.detail != null
      ? typeof entry.detail === "string"
        ? entry.detail
        : JSON.stringify(entry.detail, null, 2)
      : null;

  return (
    <div className="px-2 py-0.5 hover:bg-surface-subtle group">
      <div className="flex items-start gap-2">
        <span className="text-on-surface-faint shrink-0 tabular-nums">{time}</span>
        <span
          className={`shrink-0 uppercase text-[10px] font-semibold px-1.5 py-0.5 rounded ${SOURCE_COLORS[entry.source]} ${SOURCE_BG[entry.source]}`}
        >
          {entry.source === "ws"
            ? "WS"
            : entry.source.slice(0, 3).toUpperCase()}
        </span>
        <span className="text-on-surface-secondary break-all min-w-0">{entry.summary}</span>
        {detailStr && (
          <button
            onClick={() => setOpen(!open)}
            className="ml-auto shrink-0 text-[10px] text-on-surface-faint group-hover:text-on-surface-tertiary cursor-pointer"
          >
            {open ? "hide" : "detail"}
          </button>
        )}
      </div>
      {open && detailStr && (
        <pre className="text-[10px] text-on-surface-tertiary mt-1 ml-[4.5rem] max-w-full overflow-x-auto whitespace-pre-wrap">
          {detailStr}
        </pre>
      )}
    </div>
  );
}
