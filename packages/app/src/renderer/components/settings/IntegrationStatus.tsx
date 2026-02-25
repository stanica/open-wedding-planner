import { useState, useEffect, useCallback } from "react";
import { wsClient } from "../../lib/ws-client";
import { WhatsAppSetup } from "./WhatsAppSetup";
import { GmailSetup } from "./GmailSetup";
import type { GatewayEvent } from "@wedding-planner/shared";

interface ChannelStatuses {
  whatsapp: "disconnected" | "connecting" | "connected";
  gmail: "disconnected" | "connected";
}

export function IntegrationStatus() {
  const [statuses, setStatuses] = useState<ChannelStatuses>({
    whatsapp: "disconnected",
    gmail: "disconnected",
  });
  const [whatsappQr, setWhatsappQr] = useState<string | null>(null);

  const handleEvent = useCallback((event: GatewayEvent) => {
    if (event.name === "channel-status") {
      const { channel, status } = event.data as {
        channel: string;
        status: string;
      };
      setStatuses((prev) => ({
        ...prev,
        [channel]: status,
      }));
      if (channel === "whatsapp" && status === "connected") {
        setWhatsappQr(null);
      }
    }

    if (
      event.name === "agent-activity" &&
      event.data.sessionKey === "whatsapp-qr"
    ) {
      setWhatsappQr(event.data.detail ?? null);
    }
  }, []);

  useEffect(() => {
    return wsClient.onEvent(handleEvent);
  }, [handleEvent]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Integrations</h2>
      <div className="space-y-4">
        <WhatsAppSetup status={statuses.whatsapp} qrCode={whatsappQr} />
        <GmailSetup status={statuses.gmail} />

        {/* Calendar — no setup needed beyond Gmail OAuth */}
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Google Calendar</p>
            <p className="text-xs text-gray-400">
              Sync wedding timeline events
            </p>
          </div>
          <StatusIndicator
            status={statuses.gmail === "connected" ? "connected" : "disconnected"}
            label={
              statuses.gmail === "connected"
                ? "Available via Gmail"
                : "Connect Gmail first"
            }
          />
        </div>
      </div>
    </div>
  );
}

export function StatusIndicator({
  status,
  label,
}: {
  status: "disconnected" | "connecting" | "connected";
  label?: string;
}) {
  const colors = {
    disconnected: "bg-gray-600",
    connecting: "bg-yellow-500 animate-pulse",
    connected: "bg-green-500",
  };

  const labels = {
    disconnected: "Not connected",
    connecting: "Connecting...",
    connected: "Connected",
  };

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-400">
      <span className={`h-1.5 w-1.5 rounded-full ${colors[status]}`} />
      {label ?? labels[status]}
    </span>
  );
}
