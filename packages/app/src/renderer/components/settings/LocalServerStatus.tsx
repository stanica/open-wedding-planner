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
        <Monitor className="w-4 h-4 text-white/60" />
        <h2 className="text-sm font-semibold text-white/80">
          Local Web Server
        </h2>
      </div>

      <p className="text-xs text-white/50">
        Access the app from any browser on this machine.
      </p>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-sm text-white/80 font-mono truncate">
            {url ?? "Starting…"}
          </span>
        </div>

        <button
          onClick={handleCopy}
          disabled={!url}
          title="Copy URL"
          className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-40"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4 text-white/60" />
          )}
        </button>

        <button
          onClick={handleOpen}
          disabled={!url}
          title="Open in browser"
          className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-40"
        >
          <ExternalLink className="w-4 h-4 text-white/60" />
        </button>
      </div>
    </div>
  );
}
