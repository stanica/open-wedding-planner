import { useState } from "react";
import { X, Send, Sparkles } from "lucide-react";
import { useMutation } from "../../hooks/useRequest";

interface Vendor {
  id: number;
  name: string;
  contactEmail: string | null;
}

const INTENT_SUGGESTIONS = [
  "Request a quote for our wedding",
  "Follow up on our previous conversation",
  "Ask about availability for our date",
  "Confirm booking details",
  "Ask about menu options and pricing",
];

export function EmailComposeModal({
  vendor,
  onClose,
}: {
  vendor: Vendor;
  onClose: () => void;
}) {
  const [intent, setIntent] = useState("");
  const [drafting, setDrafting] = useState(false);
  const { mutate: dispatchAgent } = useMutation("agent.dispatch");

  async function handleDraft() {
    if (!intent.trim()) return;
    setDrafting(true);

    await dispatchAgent({
      type: "outreach",
      input: JSON.stringify({
        vendorId: vendor.id,
        channel: "email",
        intent: intent.trim(),
      }),
      vendorId: vendor.id,
    });

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-dropdown p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-on-surface">
            Email {vendor.name}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-surface-active transition-colors"
          >
            <X className="h-4 w-4 text-on-surface-secondary" />
          </button>
        </div>

        <p className="text-xs text-on-surface-secondary">
          To: {vendor.contactEmail}
        </p>

        <div className="space-y-2">
          <p className="text-xs text-on-surface-secondary">What would you like to say?</p>
          <div className="flex flex-wrap gap-1.5">
            {INTENT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setIntent(suggestion)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  intent === suggestion
                    ? "bg-blue-600 text-white"
                    : "bg-surface-elevated text-on-surface-secondary hover:bg-surface-active"
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="Or type your own message intent..."
            rows={3}
            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-on-surface placeholder:text-placeholder focus:border-blue-500 focus:outline-none resize-none"
          />
        </div>

        <button
          onClick={handleDraft}
          disabled={drafting || !intent.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {drafting ? (
            <>
              <Sparkles className="h-4 w-4 animate-pulse" />
              Drafting with AI...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Draft Email
            </>
          )}
        </button>

        <p className="text-xs text-on-surface-tertiary text-center">
          The AI will draft a personalized email using vendor and wedding details.
          You'll review it before sending.
        </p>
      </div>
    </div>
  );
}
