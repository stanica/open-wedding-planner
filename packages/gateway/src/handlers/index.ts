import type { Router } from "../infra/router.js";
import { registerWeddingConfigHandlers } from "./wedding-config.js";
import { registerCategoryHandlers } from "./categories.js";
import { registerVendorHandlers } from "./vendors.js";
import { registerVendorAttributeHandlers } from "./vendor-attributes.js";
import { registerQuoteHandlers } from "./quotes.js";
import { registerBudgetHandlers } from "./budget.js";
import { registerTaskHandlers } from "./tasks.js";
import { importBudgetCsv } from "../importers/csv-budget.js";
import { importVendorsCsv } from "../importers/csv-vendors.js";

export function registerAllHandlers(router: Router) {
  registerWeddingConfigHandlers(router);
  registerCategoryHandlers(router);
  registerVendorHandlers(router);
  registerVendorAttributeHandlers(router);
  registerQuoteHandlers(router);
  registerBudgetHandlers(router);
  registerTaskHandlers(router);

  router.register("import.budget-csv", async (db, params) => {
    const { content } = params as { content: string };
    return importBudgetCsv(db, content);
  });

  router.register("import.vendors-csv", async (db, params) => {
    const { content } = params as { content: string };
    return importVendorsCsv(db, content);
  });
}
