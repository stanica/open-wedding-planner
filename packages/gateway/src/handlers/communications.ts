import type { DeliveryQueue } from "../infra/delivery-queue.js";
import { eq, desc } from "drizzle-orm";
import { communications, vendors } from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerCommunicationHandlers(router: Router, deliveryQueue?: DeliveryQueue) {
  router.register("communications.list", async (db: Db, params: unknown) => {
    const filters = (params as {
      direction?: string;
      status?: string;
      vendorId?: number;
    } | undefined) ?? {};

    const rows = await db
      .select({
        id: communications.id,
        vendorId: communications.vendorId,
        vendorName: vendors.name,
        direction: communications.direction,
        channel: communications.channel,
        subject: communications.subject,
        bodyOriginal: communications.bodyOriginal,
        bodyTranslated: communications.bodyTranslated,
        language: communications.language,
        sentAt: communications.sentAt,
        status: communications.status,
        threadId: communications.threadId,
        parsedAt: communications.parsedAt,
      })
      .from(communications)
      .leftJoin(vendors, eq(communications.vendorId, vendors.id))
      .orderBy(desc(communications.id));

    if (filters.direction) {
      return rows.filter((r) => r.direction === filters.direction);
    }
    if (filters.status) {
      return rows.filter((r) => r.status === filters.status);
    }
    if (filters.vendorId) {
      return rows.filter((r) => r.vendorId === filters.vendorId);
    }
    return rows;
  });

  router.register("communications.get", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    const [row] = await db
      .select()
      .from(communications)
      .where(eq(communications.id, id));
    if (!row) throw new Error(`Communication ${id} not found`);
    return row;
  });

  router.register("communications.update", async (db: Db, params: unknown) => {
    const { id, ...data } = params as { id: number } & Record<string, unknown>;
    await db.update(communications).set(data).where(eq(communications.id, id));
    const [updated] = await db
      .select()
      .from(communications)
      .where(eq(communications.id, id));
    return updated;
  });

  router.register("communications.approve", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db
      .update(communications)
      .set({ status: "approved" })
      .where(eq(communications.id, id));
    const [updated] = await db
      .select()
      .from(communications)
      .where(eq(communications.id, id));

    // Enqueue approved WhatsApp messages for delivery
    if (updated && updated.channel === "whatsapp" && updated.direction === "out" && deliveryQueue) {
      const [vendor] = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, updated.vendorId));
      if (vendor?.contactWhatsapp) {
        deliveryQueue.enqueue("whatsapp", updated.vendorId, {
          communicationId: updated.id,
          to: vendor.contactWhatsapp,
          text: updated.bodyOriginal,
        });
      }
    }

    return updated;
  });

  router.register("communications.reject", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db
      .update(communications)
      .set({ status: "rejected" })
      .where(eq(communications.id, id));
    const [updated] = await db
      .select()
      .from(communications)
      .where(eq(communications.id, id));
    return updated;
  });

  router.register("communications.delete", async (db: Db, params: unknown) => {
    const { id } = params as { id: number };
    await db.delete(communications).where(eq(communications.id, id));
    return { ok: true };
  });
}
