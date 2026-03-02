import { useEffect } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { wsClient } from "./lib/ws-client";
import { AppShell } from "./components/layout/AppShell";
import { DashboardView } from "./components/dashboard/DashboardView";
import { SettingsView } from "./components/settings/SettingsView";
import { VendorListView } from "./components/vendors/VendorListView";
import { VendorDetailView } from "./components/vendors/VendorDetailView";
import { BudgetView } from "./components/budget/BudgetView";
import { ResearchView } from "./components/research/ResearchView";
import { WhatsAppView } from "./components/whatsapp/WhatsAppView";
import { CallsView } from "./components/calls/CallsView";
import { InboxView } from "./components/inbox/InboxView";
import { TimelineView } from "./components/timeline/TimelineView";
import { ToolPermissionsPage } from "./components/settings/ToolPermissionsPage";
import { DebugConsole } from "./components/debug/DebugConsole";

export function App() {
  useEffect(() => {
    wsClient.connect();
    return () => wsClient.disconnect();
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="debug" element={<DebugConsole />} />
        <Route element={<AppShell />}>
          <Route index element={<DashboardView />} />
          <Route path="research" element={<ResearchView />} />
          <Route path="vendors" element={<VendorListView />} />
          <Route path="vendors/:id" element={<VendorDetailView />} />
          <Route path="whatsapp" element={<WhatsAppView />} />
          <Route path="calls" element={<CallsView />} />
          <Route path="inbox" element={<InboxView />} />
          <Route path="timeline" element={<TimelineView />} />
          <Route path="budget" element={<BudgetView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="settings/tools" element={<ToolPermissionsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
