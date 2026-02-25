import { WeddingConfigForm } from "./WeddingConfigForm";
import { IntegrationStatus } from "./IntegrationStatus";

export function SettingsView() {
  return (
    <div className="mx-auto max-w-2xl p-6 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <WeddingConfigForm />
      <hr className="border-white/10" />
      <IntegrationStatus />
    </div>
  );
}
