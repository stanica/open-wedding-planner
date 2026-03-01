import { useState, useEffect } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { StatusIndicator } from "./IntegrationStatus";
import { Mail, Upload, ClipboardPaste } from "lucide-react";

interface GoogleStatus {
  connected: boolean;
  email: string | null;
  services: string[];
  autoSend: boolean;
  hasCredentials: boolean;
}

interface WeddingConfig {
  coupleEmail?: string;
}

const AVAILABLE_SERVICES = [
  { id: "gmail", label: "Gmail", description: "Send and receive emails" },
  { id: "calendar", label: "Calendar", description: "Manage calendar events" },
  { id: "contacts", label: "Contacts", description: "Access Google Contacts" },
  { id: "drive", label: "Drive", description: "Access Google Drive files" },
];

function openExternal(url: string) {
  if (window.electronAPI) {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, "_blank");
  }
}

export function GoogleServicesSetup() {
  const { data: status, refetch } = useRequest<GoogleStatus>("google.status");
  const { data: weddingConfig } = useRequest<WeddingConfig>("wedding-config.get");
  const { mutate: setCredentials, loading: settingCreds } = useMutation("google.set-credentials");
  const { mutate: connect, loading: connecting } = useMutation("google.connect");
  const { mutate: disconnect } = useMutation("google.disconnect");
  const { mutate: updateAutoSend } = useMutation("google.update-auto-send");

  const [email, setEmail] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>(["gmail"]);
  const [step, setStep] = useState<"credentials" | "services" | "ready">("credentials");
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedJson, setPastedJson] = useState("");
  const [credError, setCredError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Auto-fill email from wedding config
  useEffect(() => {
    if (weddingConfig?.coupleEmail && !email) {
      setEmail(weddingConfig.coupleEmail);
    }
  }, [weddingConfig]);

  useEffect(() => {
    if (status?.hasCredentials && !status.connected) {
      setStep("services");
    } else if (status?.hasCredentials && status.connected) {
      setStep("ready");
    }
  }, [status]);

  async function handleCredentialsFile() {
    setCredError(null);
    try {
      const result = await window.electronAPI?.showOpenDialog({
        filters: [{ name: "JSON", extensions: ["json"] }],
        properties: ["openFile"],
      });
      if (!result || result.canceled || !result.filePaths[0]) return;

      await setCredentials({ credentialsPath: result.filePaths[0] });
      refetch();
    } catch (err) {
      setCredError(err instanceof Error ? err.message : "Failed to save credentials");
    }
  }

  async function handlePasteCredentials() {
    if (!pastedJson.trim()) return;
    setCredError(null);

    try {
      JSON.parse(pastedJson.trim());
    } catch {
      setCredError("Invalid JSON. Make sure you copied the entire client_secret file contents.");
      return;
    }

    try {
      await setCredentials({ credentialsJson: pastedJson.trim() });
      refetch();
    } catch (err) {
      setCredError(err instanceof Error ? err.message : "Failed to save credentials");
    }
  }

  async function handleConnect() {
    if (!email) return;
    setConnectError(null);
    try {
      const result = await connect({ email, services: selectedServices });
      if (result?.authUrl) {
        openExternal(result.authUrl);
        const interval = setInterval(async () => {
          refetch();
        }, 2000);
        setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Failed to connect");
    }
  }

  function toggleService(id: string) {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  const isConnected = status?.connected ?? false;

  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-blue-400" />
          <div>
            <p className="text-sm font-medium text-on-surface">Google Services</p>
            <p className="text-xs text-on-surface-secondary">
              {isConnected
                ? `Connected as ${status?.email}`
                : "Connect Gmail, Calendar, Drive, and more"}
            </p>
          </div>
        </div>
        <StatusIndicator status={isConnected ? "connected" : "disconnected"} />
      </div>

      {/* Step 1: Upload or paste credentials */}
      {step === "credentials" && (
        <div className="space-y-3">
          <p className="text-xs text-on-surface-secondary">
            First, provide your Google Cloud OAuth credentials (client_secret.json).
            You can create one at{" "}
            <button
              onClick={() => openExternal("https://console.cloud.google.com/apis/credentials")}
              className="text-blue-400 hover:underline"
            >
              Google Cloud Console
            </button>
            .
          </p>
          {credError && (
            <p className="text-xs text-error rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              {credError}
            </p>
          )}
          {pasteMode ? (
            <div className="space-y-2">
              <textarea
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='Paste your client_secret JSON here...'
                rows={6}
                className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs font-mono text-on-surface placeholder:text-placeholder focus:border-blue-500 focus:outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handlePasteCredentials}
                  disabled={settingCreds || !pastedJson.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-on-surface hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {settingCreds ? "Saving..." : "Save Credentials"}
                </button>
                <button
                  onClick={() => setPasteMode(false)}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-on-surface-secondary hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleCredentialsFile}
                disabled={settingCreds}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-on-surface hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Upload className="h-4 w-4" />
                {settingCreds ? "Saving..." : "Upload File"}
              </button>
              <button
                onClick={() => setPasteMode(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-on-surface-secondary hover:bg-surface-hover transition-colors"
              >
                <ClipboardPaste className="h-4 w-4" />
                Paste JSON
              </button>
            </div>
          )}
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
            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder:text-placeholder focus:border-blue-500 focus:outline-none"
          />
          <div className="space-y-2">
            <p className="text-xs text-on-surface-secondary">Select services to authorize:</p>
            {AVAILABLE_SERVICES.map((svc) => (
              <label
                key={svc.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 cursor-pointer hover:bg-surface-active transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedServices.includes(svc.id)}
                  onChange={() => toggleService(svc.id)}
                  className="rounded"
                />
                <div>
                  <p className="text-sm text-on-surface">{svc.label}</p>
                  <p className="text-xs text-on-surface-secondary">{svc.description}</p>
                </div>
              </label>
            ))}
          </div>
          {connectError && (
            <p className="text-xs text-error rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 break-all">
              {connectError}
            </p>
          )}
          <button
            onClick={handleConnect}
            disabled={connecting || !email || selectedServices.length === 0}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-on-surface hover:bg-blue-700 disabled:opacity-50 transition-colors"
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

          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-4 py-3">
            <div>
              <p className="text-sm font-medium text-on-surface">Auto-send messages</p>
              <p className="text-xs text-on-surface-secondary">
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
