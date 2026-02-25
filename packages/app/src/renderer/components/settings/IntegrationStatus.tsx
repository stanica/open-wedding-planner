const INTEGRATIONS = [
  { name: "WhatsApp", description: "Send and receive messages via WhatsApp" },
  { name: "Gmail", description: "Email vendors directly from the app" },
  { name: "Google Calendar", description: "Sync wedding timeline events" },
] as const;

export function IntegrationStatus() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Integrations</h2>
      <div className="space-y-3">
        {INTEGRATIONS.map((integration) => (
          <div
            key={integration.name}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-white">
                {integration.name}
              </p>
              <p className="text-xs text-gray-400">{integration.description}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-600" />
              Not connected
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
