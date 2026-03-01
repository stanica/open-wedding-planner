import { AppearanceSettings } from "./AppearanceSettings";
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
      <AppearanceSettings />
      <hr className="border-border" />
      <WeddingConfigForm />
      <hr className="border-border" />
      <AIProviderSetup />
      <hr className="border-border" />
      <SearchConfig />
      <hr className="border-border" />
      <HeartbeatSettings />
      <hr className="border-border" />
      <ToolPermissions />
      <hr className="border-border" />
      <GuardrailsSettings />
      <hr className="border-border" />
      <IntegrationStatus />
      <hr className="border-border" />
      <LocalServerStatus />
      <hr className="border-border" />
      <TunnelStatus />
      <hr className="border-border" />
      <DataManagement />
    </div>
  );
}
