import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface ComposeBoxProps {
  onSend: (message: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function ComposeBox({
  onSend,
  disabled = false,
  placeholder = "Ask about vendors, venues, pricing...",
}: ComposeBoxProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = Math.max(36, Math.min(el.scrollHeight, 120)) + "px";
  }, [value]);

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue("");
    try {
      await onSend(trimmed);
    } catch {
      // Restore text if send failed
      setValue(trimmed);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="border-t border-white/10 p-3">
      <div className="relative">
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
