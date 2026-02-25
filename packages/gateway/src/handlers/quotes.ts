import { eq } from "drizzle-orm";
import { quotes, quoteLineItems } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerQuoteHandlers(router: Router) {
  router.register("quotes.list", async (db: Db, params: unknown) => {
    const { vendorId } = params as { vendorId: number };
    return db.select().from(quotes).where(eq(quotes.vendorId, vendorId));
  });

  router.register("quotes.get", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!quote) throw new Error(`Quote ${id} not found`);
    const lineItems = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, id));
    return { ...quote, lineItems };
  });

  router.register("quotes.create", async (db: Db, params: unknown) => {
    const { lineItems, ...data } = params as typeof quotes.$inferInsert & {
      lineItems?: Array<typeof quoteLineItems.$inferInsert>;
    };
    const [quote] = await db.insert(quotes).values(data).returning();

    if (lineItems && lineItems.length > 0) {
      await db.insert(quoteLineItems).values(
        lineItems.map((li) => ({ ...li, quoteId: quote.id })),
      );
    }

    const items = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, quote.id));
    return { ...quote, lineItems: items };
  });

  router.register("quotes.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, id));
    await db.delete(quotes).where(eq(quotes.id, id));
    return { ok: true };
  });
}
