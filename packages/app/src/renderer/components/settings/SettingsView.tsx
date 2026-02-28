import { WeddingConfigForm } from "./WeddingConfigForm";
import { IntegrationStatus } from "./IntegrationStatus";
import { AIProviderSetup } from "./AIProviderSetup";
import { SearchConfig } from "./SearchConfig";
import { HeartbeatSettings } from "./HeartbeatSettings";
import { ToolPermissions } from "./ToolPermissions";
import { GuardrailsSettings } from "./GuardrailsSettings";
import { DataManagement } from "./DataManagement";
import { LocalServerStatus } from "./LocalServerStatus";
import { TunnelStatus } from "./TunnelStatus";

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
      <HeartbeatSettings />
      <hr className="border-white/10" />
      <ToolPermissions />
      <hr className="border-white/10" />
      <GuardrailsSettings />
      <hr className="border-white/10" />
      <IntegrationStatus />
      <hr className="border-white/10" />
      <LocalServerStatus />
      <hr className="border-white/10" />
      <TunnelStatus />
      <hr className="border-white/10" />
      <DataManagement />
    </div>
  );
}
