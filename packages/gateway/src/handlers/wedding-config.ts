import { eq } from "drizzle-orm";
import { weddingConfig } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerWeddingConfigHandlers(router: Router) {
  router.register("wedding-config.get", async (db: Db) => {
    const rows = await db.select().from(weddingConfig);
    if (rows.length === 0) {
      return {
        weddingDate: null,
        guestCount: null,
        totalBudget: null,
        currency: "EUR",
        coupleNames: null,
        email: null,
        location: null,
        languagePreferences: ["en", "it"],
        dietaryRequirements: null,
        alcoholPreferences: null,
      };
    }
    const row = rows[0];
    return {
      ...row,
      totalBudget: row.budgetTotal,
      email: row.coupleEmail,
      budgetTotal: undefined,
      coupleEmail: undefined,
      languagePreferences: JSON.parse(row.languagePreferences),
    };
  });

  router.register("wedding-config.update", async (db: Db, params: unknown) => {
    const data = params as Record<string, unknown>;
    const values: Record<string, unknown> = { ...data };
    if (data.totalBudget !== undefined) {
      values.budgetTotal = data.totalBudget;
      delete values.totalBudget;
    }
    if (data.email !== undefined) {
      values.coupleEmail = data.email;
      delete values.email;
    }
    if (data.languagePreferences) {
      values.languagePreferences = JSON.stringify(data.languagePreferences);
    }

    const existing = await db.select().from(weddingConfig);
    if (existing.length === 0) {
      await db.insert(weddingConfig).values(values);
    } else {
      await db
        .update(weddingConfig)
        .set(values)
        .where(eq(weddingConfig.id, existing[0].id));
    }

    const [updated] = await db.select().from(weddingConfig);
    return {
      ...updated,
      totalBudget: updated.budgetTotal,
      email: updated.coupleEmail,
      budgetTotal: undefined,
      coupleEmail: undefined,
      languagePreferences: JSON.parse(updated.languagePreferences),
    };
  });
}
