import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

export interface SlashCommand {
  name: string;
  description: string;
  args?: string; // e.g. "<model-name>" for /model
}

interface ComposeBoxProps {
  onSend: (message: string) => void | Promise<void>;
  onSlashCommand?: (command: string, args: string) => void | Promise<void>;
  slashCommands?: SlashCommand[];
  disabled?: boolean;
  placeholder?: string;
}

export function ComposeBox({
  onSend,
  onSlashCommand,
  slashCommands,
  disabled = false,
  placeholder = "Ask about vendors, venues, pricing...",
}: ComposeBoxProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filteredCommands = slashCommands?.filter((cmd) =>
    value.startsWith("/") ? cmd.name.startsWith(value.split(" ")[0].slice(1)) : false,
  ) ?? [];

  useEffect(() => {
    setShowCommands(value.startsWith("/") && filteredCommands.length > 0);
    setSelectedIdx(0);
  }, [value]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = Math.max(36, Math.min(el.scrollHeight, 120)) + "px";
  }, [value]);

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    // Check for slash command
    if (trimmed.startsWith("/") && onSlashCommand && slashCommands) {
      const parts = trimmed.split(/\s+/);
      const cmdName = parts[0].slice(1);
      const cmdArgs = parts.slice(1).join(" ");
      const matched = slashCommands.find((c) => c.name === cmdName);
      if (matched) {
        setValue("");
        setShowCommands(false);
        try {
          await onSlashCommand(cmdName, cmdArgs);
        } catch {
          setValue(trimmed);
        }
        return;
      }
    }

    setValue("");
    try {
      await onSend(trimmed);
    } catch {
      setValue(trimmed);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showCommands) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const cmd = filteredCommands[selectedIdx];
        if (cmd) {
          setValue(`/${cmd.name}${cmd.args ? " " : ""}`);
          setShowCommands(false);
        }
        return;
      }
      if (e.key === "Escape") {
        setShowCommands(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="border-t border-white/10 p-3">
      <div className="relative">
        {showCommands && (
          <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border border-white/10 bg-gray-900 py-1 shadow-xl">
            {filteredCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === selectedIdx ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setValue(`/${cmd.name}${cmd.args ? " " : ""}`);
                  setShowCommands(false);
                  textareaRef.current?.focus();
                }}
              >
                <span className="font-mono text-xs text-purple-400">/{cmd.name}</span>
                <span className="text-xs text-gray-500">{cmd.description}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="w-full resize-none rounded-lg border border-white/10 bg-white/5 pl-3 pr-9 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/20 disabled:opacity-50 leading-5 overflow-hidden"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="absolute right-2 bottom-px top-0 my-auto h-fit rounded-md p-1 text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
