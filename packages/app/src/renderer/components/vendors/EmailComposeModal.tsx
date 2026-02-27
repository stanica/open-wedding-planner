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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-gray-900 p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Email {vendor.name}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <p className="text-xs text-gray-400">
          To: {vendor.contactEmail}
        </p>

        <div className="space-y-2">
          <p className="text-xs text-gray-400">What would you like to say?</p>
          <div className="flex flex-wrap gap-1.5">
            {INTENT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setIntent(suggestion)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  intent === suggestion
                    ? "bg-blue-600 text-white"
                    : "bg-white/5 text-gray-300 hover:bg-white/10"
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
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none resize-none"
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

        <p className="text-xs text-gray-500 text-center">
          The AI will draft a personalized email using vendor and wedding details.
          You'll review it before sending.
        </p>
      </div>
    </div>
  );
}
