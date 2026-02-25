import { useState } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { StatusIndicator } from "./IntegrationStatus";
import { Mail } from "lucide-react";

interface GmailSetupProps {
  status: "disconnected" | "connected";
}

export function GmailSetup({ status }: GmailSetupProps) {
  const { data: gmailStatus } = useRequest<{
    connected: boolean;
    email?: string;
  }>("gmail.status");
  const { mutate: getAuthUrl } = useMutation<
    Record<string, never>,
    { url: string }
  >("gmail.auth-url");
  const [authCode, setAuthCode] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const { mutate: submitCode, loading: submitting } = useMutation<
    { code: string },
    { ok: boolean }
  >("gmail.auth-callback");

  async function handleStartAuth() {
    const result = await getAuthUrl({});
    window.open(result.url, "_blank");
    setShowCodeInput(true);
  }

  async function handleSubmitCode() {
    await submitCode({ code: authCode.trim() });
    setAuthCode("");
    setShowCodeInput(false);
  }

  const isConnected = status === "connected" || gmailStatus?.connected;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-blue-400" />
          <div>
            <p className="text-sm font-medium text-white">Gmail</p>
            <p className="text-xs text-gray-400">
              {isConnected && gmailStatus?.email
                ? `Connected as ${gmailStatus.email}`
                : "Email vendors directly from the app"}
            </p>
          </div>
        </div>
        <StatusIndicator status={isConnected ? "connected" : "disconnected"} />
      </div>

      {!isConnected && !showCodeInput && (
        <button
          onClick={handleStartAuth}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Connect Gmail Account
        </button>
      )}

      {showCodeInput && !isConnected && (
        <div className="space-y-2">
          <p className="text-sm text-gray-300">
            Paste the authorization code from Google:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="Authorization code"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleSubmitCode}
              disabled={!authCode.trim() || submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Verifying..." : "Submit"}
            </button>
          </div>
          <button
            onClick={() => setShowCodeInput(false)}
            className="text-xs text-gray-500 hover:text-gray-400"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
