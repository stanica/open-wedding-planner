import { useState, useRef, useEffect } from "react";
import { Plus, MessageSquare, Trash2 } from "lucide-react";

interface Thread {
  id: number;
  title: string;
  categoryTags: string | null;
  updatedAt: string;
}

interface ThreadListProps {
  threads: Thread[];
  activeThreadId: number | null;
  onSelect: (threadId: number) => void;
  onCreate: () => void;
  onDelete?: (threadId: number) => void;
  onRename?: (threadId: number, title: string) => void;
}

export function ThreadList({ threads, activeThreadId, onSelect, onCreate, onDelete, onRename }: ThreadListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  function startEditing(thread: Thread) {
    setEditingId(thread.id);
    setEditValue(thread.title);
  }

  function commitEdit() {
    if (editingId !== null && editValue.trim() && onRename) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  }
  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="p-3 border-b border-border">
        <button
          onClick={onCreate}
          className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-on-surface-secondary hover:bg-surface-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
          New thread
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.map((thread) => {
          const tags: string[] = thread.categoryTags ? JSON.parse(thread.categoryTags) : [];
          const isActive = thread.id === activeThreadId;
          return (
            <div
              key={thread.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(thread.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(thread.id);
                }
              }}
              className={`w-full text-left px-3 py-3 border-b border-border-subtle transition-colors group cursor-pointer ${
                isActive ? "bg-surface-active" : "hover:bg-surface-hover"
              }`}
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-on-surface-tertiary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  {editingId === thread.id ? (
                    <input
                      ref={inputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm font-medium text-on-surface bg-surface-active rounded px-1 py-0.5 w-full outline-none ring-1 ring-purple-500/50"
                    />
                  ) : (
                    <p
                      className="text-sm font-medium text-on-surface truncate"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startEditing(thread);
                      }}
                    >
                      {thread.title}
                    </p>
                  )}
                  <p className="text-xs text-on-surface-tertiary mt-0.5">
                    {new Date(thread.updatedAt).toLocaleDateString()}
                  </p>
                  {tags.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-elevated text-on-surface-secondary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(thread.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface-active text-on-surface-tertiary hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {threads.length === 0 && (
          <div className="p-4 text-center text-sm text-on-surface-tertiary">
            No threads yet. Start a new one!
          </div>
        )}
      </div>
    </div>
  );
}
