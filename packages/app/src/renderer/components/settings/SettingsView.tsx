import { WeddingConfigForm } from "./WeddingConfigForm";
import { IntegrationStatus } from "./IntegrationStatus";
import { AIProviderSetup } from "./AIProviderSetup";
import { SearchConfig } from "./SearchConfig";
import { ToolPermissions } from "./ToolPermissions";

export function SettingsView() {
  return (
    <div className="mx-auto max-w-2xl p-6 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <WeddingConfigForm />
      <hr className="border-white/10" />
      <AIProviderSetup />
      <hr className="border-white/10" />
      <SearchConfig />
      <hr className="border-white/10" />
      <ToolPermissions />
      <hr className="border-white/10" />
      <IntegrationStatus />
    </div>
  );
}
