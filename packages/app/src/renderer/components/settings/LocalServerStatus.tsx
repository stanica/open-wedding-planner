import { useEffect, useState } from "react";
import { Monitor, Copy, Check, ExternalLink } from "lucide-react";

export function LocalServerStatus() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.electronAPI?.getLocalServerUrl().then(setUrl);
  }, []);

  function handleCopy() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpen() {
    if (!url) return;
    if (window.electronAPI) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Monitor className="w-4 h-4 text-on-surface-secondary" />
        <h2 className="text-sm font-semibold text-on-surface">
          Local Web Server
        </h2>
      </div>

      <p className="text-xs text-on-surface-tertiary">
        Access the app from any browser on this machine.
      </p>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 bg-surface-elevated border border-border rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-success shrink-0" />
          <span className="text-sm text-on-surface font-mono truncate">
            {url ?? "Starting…"}
          </span>
        </div>

        <button
          onClick={handleCopy}
          disabled={!url}
          title="Copy URL"
          className="p-2 rounded-lg bg-surface-elevated border border-border hover:bg-surface-active transition-colors disabled:opacity-40"
        >
          {copied ? (
            <Check className="w-4 h-4 text-success" />
          ) : (
            <Copy className="w-4 h-4 text-on-surface-secondary" />
          )}
        </button>

        <button
          onClick={handleOpen}
          disabled={!url}
          title="Open in browser"
          className="p-2 rounded-lg bg-surface-elevated border border-border hover:bg-surface-active transition-colors disabled:opacity-40"
        >
          <ExternalLink className="w-4 h-4 text-on-surface-secondary" />
        </button>
      </div>
    </div>
  );
}
