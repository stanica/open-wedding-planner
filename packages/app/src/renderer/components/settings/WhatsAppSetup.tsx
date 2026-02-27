import { QRCodeSVG } from "qrcode.react";
import { useMutation } from "../../hooks/useRequest";
import { StatusIndicator } from "./IntegrationStatus";
import { MessageCircle } from "lucide-react";

interface WhatsAppSetupProps {
  status: "disconnected" | "connecting" | "connected";
  qrCode: string | null;
  autoSend: boolean;
  onAutoSendChange: (value: boolean) => void;
}

export function WhatsAppSetup({ status, qrCode, autoSend, onAutoSendChange }: WhatsAppSetupProps) {
  const { mutate: connect, loading: connecting } = useMutation(
    "whatsapp.connect",
  );
  const { mutate: disconnect } = useMutation("whatsapp.disconnect");

  async function handleConnect() {
    await connect({});
  }

  async function handleDisconnect() {
    await disconnect({});
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-5 w-5 text-green-400" />
          <div>
            <p className="text-sm font-medium text-white">WhatsApp</p>
            <p className="text-xs text-gray-400">
              Send and receive messages via WhatsApp
            </p>
          </div>
        </div>
        <StatusIndicator status={status} />
      </div>

      {status === "disconnected" && (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {connecting ? "Starting..." : "Connect WhatsApp"}
        </button>
      )}

      {qrCode && status === "connecting" && (
        <div className="flex flex-col items-center gap-3 py-4">
          <p className="text-sm text-gray-300">
            Scan this QR code with WhatsApp on your phone
          </p>
          <div className="rounded-xl bg-white p-4">
            <QRCodeSVG value={qrCode} size={256} />
          </div>
          <p className="text-xs text-gray-500">
            Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device
          </p>
        </div>
      )}

      {status === "connecting" && !qrCode && (
        <p className="text-sm text-yellow-400 animate-pulse">
          Waiting for QR code...
        </p>
      )}

      {status === "connected" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Auto-send messages</p>
              <p className="text-xs text-gray-400">
                When off, outgoing messages are saved as drafts for your review
              </p>
            </div>
            <button
              onClick={() => onAutoSendChange(!autoSend)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoSend ? "bg-green-600" : "bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoSend ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <button
            onClick={handleDisconnect}
            className="w-full rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
