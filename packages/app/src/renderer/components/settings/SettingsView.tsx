import { useSearchParams } from "react-router-dom";
import { AppearanceSettings } from "./AppearanceSettings";
import { WeddingConfigForm } from "./WeddingConfigForm";
import { IntegrationStatus } from "./IntegrationStatus";
import { AIProviderSetup } from "./AIProviderSetup";
import { SearchConfig } from "./SearchConfig";
import { HeartbeatSettings } from "./HeartbeatSettings";
import { GuardrailsSettings } from "./GuardrailsSettings";
import { DataManagement } from "./DataManagement";
import { LocalServerStatus } from "./LocalServerStatus";
import { TunnelStatus } from "./TunnelStatus";
import { VapiSettings } from "./VapiSettings";
import { ToolPermissionsSummary } from "./ToolPermissionsSummary";

const TABS = ["General", "AI", "Integrations", "Advanced"] as const;
type SettingsTab = (typeof TABS)[number];

function isValidTab(value: string | null): value is SettingsTab {
  return TABS.includes(value as SettingsTab);
}

export function SettingsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: SettingsTab = isValidTab(tabParam) ? tabParam : "General";

  function setTab(tab: SettingsTab) {
    setSearchParams({ tab }, { replace: true });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border">
        <div className="flex items-baseline gap-6 px-6 pt-4">
          <h1 className="mr-2 text-lg font-semibold text-on-surface">Settings</h1>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              className={`pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-accent text-on-surface"
                  : "text-on-surface-secondary hover:text-on-surface"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-8 p-6">
          {activeTab === "General" && (
            <>
              <AppearanceSettings />
              <WeddingConfigForm />
            </>
          )}
          {activeTab === "AI" && (
            <>
              <HeartbeatSettings />
              <AIProviderSetup />
              <SearchConfig />
            </>
          )}
          {activeTab === "Integrations" && (
            <>
              <IntegrationStatus />
              <VapiSettings />
            </>
          )}
          {activeTab === "Advanced" && (
            <>
              <GuardrailsSettings />
              <ToolPermissionsSummary />
              <LocalServerStatus />
              <TunnelStatus />
              <DataManagement />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
