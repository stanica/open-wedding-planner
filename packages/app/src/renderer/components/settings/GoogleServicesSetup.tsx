import { useState, useEffect } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { StatusIndicator } from "./IntegrationStatus";
import { Mail, Upload } from "lucide-react";

interface GoogleStatus {
  connected: boolean;
  email: string | null;
  services: string[];
  autoSend: boolean;
  hasCredentials: boolean;
}

const AVAILABLE_SERVICES = [
  { id: "gmail", label: "Gmail", description: "Send and receive emails" },
  { id: "calendar", label: "Calendar", description: "Manage calendar events" },
  { id: "contacts", label: "Contacts", description: "Access Google Contacts" },
  { id: "drive", label: "Drive", description: "Access Google Drive files" },
];

export function GoogleServicesSetup() {
  const { data: status, refetch } = useRequest<GoogleStatus>("google.status");
  const { mutate: setCredentials, loading: settingCreds } = useMutation("google.set-credentials");
  const { mutate: connect, loading: connecting } = useMutation("google.connect");
  const { mutate: disconnect } = useMutation("google.disconnect");
  const { mutate: updateAutoSend } = useMutation("google.update-auto-send");

  const [email, setEmail] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>(["gmail"]);
  const [step, setStep] = useState<"credentials" | "services" | "ready">("credentials");

  useEffect(() => {
    if (status?.hasCredentials && !status.connected) {
      setStep("services");
    } else if (status?.hasCredentials && status.connected) {
      setStep("ready");
    }
  }, [status]);

  async function handleCredentialsFile() {
    const result = await window.electronAPI.showOpenDialog({
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return;

    await setCredentials({ credentialsPath: result.filePaths[0] });
    refetch();
  }

  async function handleConnect() {
    if (!email) return;
    const result = await connect({ email, services: selectedServices });
    if (result?.authUrl) {
      window.electronAPI.openExternal(result.authUrl);
      // Poll for connection status
      const interval = setInterval(async () => {
        const updated = await refetch();
        if (updated?.connected) {
          clearInterval(interval);
        }
      }, 2000);
      setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
    }
  }

  function toggleService(id: string) {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  const isConnected = status?.connected ?? false;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-blue-400" />
          <div>
            <p className="text-sm font-medium text-white">Google Services</p>
            <p className="text-xs text-gray-400">
              {isConnected
                ? `Connected as ${status?.email}`
                : "Connect Gmail, Calendar, Drive, and more"}
            </p>
          </div>
        </div>
        <StatusIndicator status={isConnected ? "connected" : "disconnected"} />
      </div>

      {/* Step 1: Upload credentials */}
      {step === "credentials" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            First, upload your Google Cloud OAuth credentials (client_secret.json).
            You can create one at{" "}
            <button
              onClick={() =>
                window.electronAPI.openExternal("https://console.cloud.google.com/apis/credentials")
              }
              className="text-blue-400 hover:underline"
            >
              Google Cloud Console
            </button>
            .
          </p>
          <button
            onClick={handleCredentialsFile}
            disabled={settingCreds}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {settingCreds ? "Saving..." : "Upload client_secret.json"}
          </button>
        </div>
      )}

      {/* Step 2: Pick services + connect */}
      {step === "services" && (
        <div className="space-y-3">
          <input
            type="email"
            placeholder="your@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <div className="space-y-2">
            <p className="text-xs text-gray-400">Select services to authorize:</p>
            {AVAILABLE_SERVICES.map((svc) => (
              <label
                key={svc.id}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedServices.includes(svc.id)}
                  onChange={() => toggleService(svc.id)}
                  className="rounded"
                />
                <div>
                  <p className="text-sm text-white">{svc.label}</p>
                  <p className="text-xs text-gray-400">{svc.description}</p>
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting || !email || selectedServices.length === 0}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {connecting ? "Opening browser..." : "Connect Google Account"}
          </button>
        </div>
      )}

      {/* Connected state */}
      {isConnected && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {status?.services.map((svc) => (
              <span
                key={svc}
                className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300"
              >
                {svc}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Auto-send messages</p>
              <p className="text-xs text-gray-400">
                When off, outgoing emails are saved as drafts for your review
              </p>
            </div>
            <button
              onClick={() => updateAutoSend({ autoSend: !status?.autoSend })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                status?.autoSend ? "bg-blue-600" : "bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status?.autoSend ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <button
            onClick={async () => {
              await disconnect({});
              refetch();
            }}
            className="w-full rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
