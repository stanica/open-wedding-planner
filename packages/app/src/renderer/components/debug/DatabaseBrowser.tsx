import { useState, useEffect, useCallback, useRef } from "react";
import { wsClient } from "../../lib/ws-client";

const PAGE_SIZE = 50;

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}

export function DatabaseBrowser() {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch table list on mount
  useEffect(() => {
    wsClient.request<string[]>("db.tables").then((t) => {
      setTables(t);
      if (t.length > 0 && !selectedTable) setSelectedTable(t[0]);
    });
  }, []);

  // Fetch rows when table or page changes
  const fetchRows = useCallback(async () => {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const data = await wsClient.request<QueryResult>("db.query", {
        table: selectedTable,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  }, [selectedTable, page]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleSelectTable = (table: string) => {
    setSelectedTable(table);
    setPage(0);
    setResult(null);
  };

  const totalPages = result ? Math.ceil(result.total / PAGE_SIZE) : 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Table list sidebar */}
      <div className="w-48 shrink-0 border-r border-border overflow-y-auto bg-surface-dropdown">
        {tables.map((t) => (
          <button
            key={t}
            onClick={() => handleSelectTable(t)}
            className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
              t === selectedTable
                ? "bg-surface-active text-on-surface"
                : "text-on-surface-tertiary hover:text-on-surface-secondary hover:bg-surface-hover"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Main data area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {result && (
          <>
            {/* Pagination bar */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
              <span className="text-on-surface-tertiary">
                {selectedTable}
              </span>
              <span className="text-on-surface-faint">
                {result.total} row{result.total !== 1 ? "s" : ""}
              </span>
              <div className="flex-1" />
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-2 py-0.5 rounded text-on-surface-tertiary hover:bg-surface-hover disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <span className="text-on-surface-faint tabular-nums">
                    {page + 1}/{totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-2 py-0.5 rounded text-on-surface-tertiary hover:bg-surface-hover disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* Data table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="sticky top-0 bg-surface-dropdown">
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        className="text-left px-2 py-1 border-b border-border text-on-surface-tertiary font-medium whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-surface-subtle">
                      {result.columns.map((col) => (
                        <EditableCell
                          key={col}
                          table={selectedTable!}
                          rowId={row.id as number}
                          column={col}
                          value={row[col]}
                          onSaved={fetchRows}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {loading && (
                <div className="text-center py-4 text-on-surface-faint">
                  Loading...
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EditableCell({
  table,
  rowId,
  column,
  value,
  onSaved,
}: {
  table: string;
  rowId: number;
  column: string;
  value: unknown;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const savingRef = useRef(false);

  const displayValue =
    value === null
      ? "NULL"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  const handleStartEdit = () => {
    if (column === "id") return; // Don't allow editing primary key
    setDraft(value === null ? "" : String(value));
    setEditing(true);
    setStatus("idle");
    savingRef.current = false;
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    try {
      const parsed = draft === "" ? null : draft;
      await wsClient.request("db.update", {
        table,
        id: rowId,
        column,
        value: parsed,
      });
      setEditing(false);
      setStatus("idle");
      onSaved();
    } catch {
      setStatus("error");
      savingRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      savingRef.current = true; // Prevent blur from saving
      setEditing(false);
      setStatus("idle");
    }
  };

  if (editing) {
    return (
      <td className="px-2 py-0.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => handleSave()}
          className={`w-full bg-surface-elevated border rounded px-1 py-0.5 text-xs text-on-surface outline-none ${
            status === "error" ? "border-error" : "border-border-hover"
          }`}
        />
      </td>
    );
  }

  return (
    <td
      onClick={handleStartEdit}
      className={`px-2 py-0.5 whitespace-nowrap max-w-64 truncate ${
        column === "id"
          ? "text-on-surface-faint"
          : "cursor-pointer hover:bg-surface-hover"
      } ${value === null ? "text-on-surface-faint italic" : "text-on-surface-secondary"}`}
      title={displayValue}
    >
      {displayValue}
    </td>
  );
}
