import type { Router } from "../infra/router.js";
import type { ProxyManager } from "../infra/proxy-manager.js";
import type { DeliveryQueue } from "../infra/delivery-queue.js";
import type { GogManager } from "../infra/gog-manager.js";
import type { EmbeddingService } from "../db/embeddings.js";
import type Database from "better-sqlite3";
import type { GatewayEvent } from "@wedding-planner/shared";
import { registerWeddingConfigHandlers } from "./wedding-config.js";
import { registerCategoryHandlers } from "./categories.js";
import { registerVendorHandlers } from "./vendors.js";
import { registerVendorAttributeHandlers } from "./vendor-attributes.js";
import { registerVendorImageHandlers } from "./vendor-images.js";
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
import { registerGoogleAuthHandlers } from "./google-auth.js";
import { registerDataManagementHandlers } from "./data-management.js";
import { registerGuardrailsConfigHandlers } from "./guardrails-config.js";
import { registerDbHandlers } from "./db.js";
import { importBudgetCsv } from "../importers/csv-budget.js";
import { importVendorsCsv } from "../importers/csv-vendors.js";
import { getImagesDir } from "../config/paths.js";

export function registerAllHandlers(
  router: Router,
  proxyManager: ProxyManager,
  deliveryQueue?: DeliveryQueue,
  gogManager?: GogManager,
  imagesDir?: string,
  embeddingService?: EmbeddingService,
  sqlite?: Database.Database,
  broadcast?: (event: GatewayEvent) => void,
) {
  registerWeddingConfigHandlers(router);
  registerCategoryHandlers(router);
  registerVendorHandlers(router, broadcast);
  registerVendorAttributeHandlers(router);
  registerVendorImageHandlers(router, imagesDir ?? getImagesDir());
  registerQuoteHandlers(router);
  registerBudgetHandlers(router, broadcast);
  registerTaskHandlers(router, broadcast);
  registerCommunicationHandlers(router, deliveryQueue);
  registerResearchNoteHandlers(router);
  registerDashboardHandlers(router);
  registerAIConfigHandlers(router, proxyManager, embeddingService, sqlite);
  registerToolPermissionHandlers(router);
  registerSearchConfigHandlers(router);
  registerHeartbeatConfigHandlers(router);
  registerResearchThreadHandlers(router, broadcast);

  if (gogManager) {
    registerGoogleAuthHandlers(router, gogManager);
  }

  registerGuardrailsConfigHandlers(router);
  registerDataManagementHandlers(router);

  if (sqlite) {
    registerDbHandlers(router, sqlite);
  }

  router.register("import.budget-csv", async (db, params) => {
    const { content } = params as { content: string };
    return importBudgetCsv(db, content);
  });

  router.register("import.vendors-csv", async (db, params) => {
    const { content } = params as { content: string };
    return importVendorsCsv(db, content);
  });
}
