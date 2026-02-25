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
import { OutreachView } from "./components/outreach/OutreachView";
import { InboxView } from "./components/inbox/InboxView";
import { TimelineView } from "./components/timeline/TimelineView";

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
          <Route path="research" element={<ResearchView />} />
          <Route path="vendors" element={<VendorListView />} />
          <Route path="vendors/:id" element={<VendorDetailView />} />
          <Route path="outreach" element={<OutreachView />} />
          <Route path="inbox" element={<InboxView />} />
          <Route path="timeline" element={<TimelineView />} />
          <Route path="budget" element={<BudgetView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
