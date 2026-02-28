import { useEffect, useState } from "react";
import {
  Globe,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { wsClient } from "../../lib/ws-client";
import { useMutation } from "../../hooks/useRequest";

type TunnelState =
  | { state: "stopped" }
  | { state: "starting" }
  | { state: "running"; url: string }
  | { state: "error"; message: string };

export function TunnelStatus() {
  const [status, setStatus] = useState<TunnelState>({ state: "stopped" });
  const [copied, setCopied] = useState(false);
  const { mutate: startTunnel, loading: starting } =
    useMutation("tunnel.start");
  const { mutate: stopTunnel, loading: stopping } = useMutation("tunnel.stop");

  // Load initial status and subscribe to live updates
  useEffect(() => {
    wsClient
      .request<TunnelState>("tunnel.status")
      .then(setStatus)
      .catch(() => {});

    return wsClient.onEvent((event) => {
      if ((event.name as string) === "tunnel.status") {
        setStatus(event.data as unknown as TunnelState);
      }
    });
  }, []);

  async function handleToggle() {
    if (status.state === "stopped" || status.state === "error") {
      const result = (await startTunnel({})) as TunnelState;
      setStatus(result);
    } else if (status.state === "running") {
      const result = (await stopTunnel({})) as TunnelState;
      setStatus(result);
    }
  }

  function handleCopy() {
    if (status.state !== "running") return;
    navigator.clipboard.writeText(status.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isActive = status.state === "running" || status.state === "starting";
  const isBusy = starting || stopping || status.state === "starting";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-white/60" />
        <h2 className="text-sm font-semibold text-white/80">Internet Tunnel</h2>
      </div>

      <p className="text-xs text-white/50">
        Expose the app to the internet via a temporary Cloudflare URL. No
        account required.
      </p>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 min-w-0">
          <StatusDot state={status.state} />
          <span className="text-sm text-white/80 font-mono truncate">
            {status.state === "running" && status.url}
            {status.state === "starting" && "Starting tunnel…"}
            {status.state === "stopped" && "Tunnel not active"}
            {status.state === "error" && (
              <span className="text-red-400">{status.message}</span>
            )}
          </span>
        </div>

        {status.state === "running" && (
          <button
            onClick={handleCopy}
            title="Copy URL"
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shrink-0"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-white/60" />
            )}
          </button>
        )}

        {status.state === "running" && (
          <button
            onClick={() => {
              if (window.electronAPI) {
                window.electronAPI.openExternal(status.url);
              } else {
                window.open(status.url, "_blank");
              }
            }}
            title="Open in browser"
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shrink-0"
          >
            <ExternalLink className="w-4 h-4 text-white/60" />
          </button>
        )}

        <button
          onClick={handleToggle}
          disabled={isBusy}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 disabled:opacity-50 ${
            isActive
              ? "bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30"
              : "bg-white/10 border border-white/20 text-white/80 hover:bg-white/20"
          }`}
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isActive ? (
            "Stop"
          ) : (
            "Start"
          )}
        </button>
      </div>

      {status.state === "error" && (
        <div className="flex items-start gap-2 text-xs text-red-400/80 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Make sure the app was installed via the packaged installer, which
            includes the cloudflared binary.
          </span>
        </div>
      )}
    </div>
  );
}

function StatusDot({ state }: { state: TunnelState["state"] }) {
  if (state === "running")
    return <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />;
  if (state === "starting")
    return (
      <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
    );
  if (state === "error")
    return <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-white/20 shrink-0" />;
}
