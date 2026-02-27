import type { Router } from "../infra/router.js";
import type { ProxyManager } from "../infra/proxy-manager.js";
import type { DeliveryQueue } from "../infra/delivery-queue.js";
import { registerWeddingConfigHandlers } from "./wedding-config.js";
import { registerCategoryHandlers } from "./categories.js";
import { registerVendorHandlers } from "./vendors.js";
import { registerVendorAttributeHandlers } from "./vendor-attributes.js";
import { registerQuoteHandlers } from "./quotes.js";
import { registerBudgetHandlers } from "./budget.js";
import { registerTaskHandlers } from "./tasks.js";
import { registerCommunicationHandlers } from "./communications.js";
import { registerResearchNoteHandlers } from "./research-notes.js";
import { registerDashboardHandlers } from "./dashboard.js";
import { registerAIConfigHandlers } from "./ai-config.js";
import { registerToolPermissionHandlers } from "./tool-permissions.js";
import { registerSearchConfigHandlers } from "./search-config.js";
import { registerHeartbeatConfigHandlers } from "./heartbeat-config.js";
import { registerResearchThreadHandlers } from "./research-threads.js";
import { importBudgetCsv } from "../importers/csv-budget.js";
import { importVendorsCsv } from "../importers/csv-vendors.js";

export function registerAllHandlers(router: Router, proxyManager: ProxyManager, deliveryQueue?: DeliveryQueue) {
  registerWeddingConfigHandlers(router);
  registerCategoryHandlers(router);
  registerVendorHandlers(router);
  registerVendorAttributeHandlers(router);
  registerQuoteHandlers(router);
  registerBudgetHandlers(router);
  registerTaskHandlers(router);
  registerCommunicationHandlers(router, deliveryQueue);
  registerResearchNoteHandlers(router);
  registerDashboardHandlers(router);
  registerAIConfigHandlers(router, proxyManager);
  registerToolPermissionHandlers(router);
  registerSearchConfigHandlers(router);
  registerHeartbeatConfigHandlers(router);
  registerResearchThreadHandlers(router);

  router.register("import.budget-csv", async (db, params) => {
    const { content } = params as { content: string };
    return importBudgetCsv(db, content);
  });

  router.register("import.vendors-csv", async (db, params) => {
    const { content } = params as { content: string };
    return importVendorsCsv(db, content);
  });
}
