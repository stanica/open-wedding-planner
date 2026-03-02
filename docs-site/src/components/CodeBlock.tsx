import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  children: string;
  label?: string;
}

export function CodeBlock({ children, label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="not-prose group relative my-4 rounded-xl border border-white/[0.06] bg-gray-950 dark:bg-black/50 shadow-sm">
      {label && (
        <div className="flex items-center border-b border-white/[0.06] px-4 py-2">
          <span className="text-[11px] font-medium tracking-wide text-gray-500 uppercase">
            {label}
          </span>
        </div>
      )}
      <div className="relative">
        <pre className="!m-0 !rounded-none !border-0 !bg-transparent overflow-x-auto px-4 py-3.5 text-[13px] leading-relaxed text-gray-300">
          <code>{children}</code>
        </pre>
        <button
          onClick={copy}
          className="absolute right-2 top-2 rounded-md p-1.5 text-gray-500 opacity-0 transition-all hover:bg-white/10 hover:text-gray-300 group-hover:opacity-100"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
