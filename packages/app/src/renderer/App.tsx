import { useEffect } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { useGatewayStore } from "./stores/gateway-store";
import { wsClient } from "./lib/ws-client";
import { AppShell } from "./components/layout/AppShell";
import { SettingsView } from "./components/settings/SettingsView";
import { VendorListView } from "./components/vendors/VendorListView";

function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center text-gray-500">
      <p className="text-lg">{title} — coming soon</p>
    </div>
  );
}

function DashboardView() {
  const connected = useGatewayStore((s) => s.connected);
  const state = useGatewayStore((s) => s.state);

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>
      <div className="flex items-center gap-2">
        <div
          className={`h-3 w-3 rounded-full ${connected ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`}
        />
        <span>
          {connected
            ? `Connected to gateway v${state?.version ?? "?"}`
            : "Connecting..."}
        </span>
      </div>
    </div>
  );
}

export function App() {
  useEffect(() => {
    wsClient.connect();
    return () => wsClient.disconnect();
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardView />} />
          <Route path="research" element={<PlaceholderView title="Research" />} />
          <Route path="vendors" element={<VendorListView />} />
          <Route path="outreach" element={<PlaceholderView title="Outreach" />} />
          <Route path="inbox" element={<PlaceholderView title="Inbox" />} />
          <Route path="timeline" element={<PlaceholderView title="Timeline" />} />
          <Route path="budget" element={<PlaceholderView title="Budget" />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
