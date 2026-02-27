import { sql } from "drizzle-orm";
import {
  vendors,
  categories,
  budgetEntries,
  communications,
  agentTasks,
  weddingConfig,
  heartbeatConfig,
} from "../db/schema.js";
import type { Router, Db } from "../infra/router.js";

export function registerDashboardHandlers(router: Router) {
  router.register("dashboard.stats", async (db: Db) => {
    // Vendor counts by status
    const vendorRows = await db
      .select({
        status: vendors.status,
        count: sql<number>`count(*)`,
      })
      .from(vendors)
      .groupBy(vendors.status);

    const vendorsByStatus: Record<string, number> = {};
    for (const row of vendorRows) {
      vendorsByStatus[row.status] = row.count;
    }

    // Vendor counts by category
    const categoryRows = await db
      .select({
        categoryId: vendors.categoryId,
        categoryName: categories.name,
        count: sql<number>`count(*)`,
      })
      .from(vendors)
      .leftJoin(categories, sql`${vendors.categoryId} = ${categories.id}`)
      .groupBy(vendors.categoryId);

    const vendorsByCategory = categoryRows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName ?? "Uncategorized",
      count: r.count,
    }));

    // Budget summary
    const budgetRows = await db
      .select({
        totalAllocated: sql<number>`coalesce(sum(${budgetEntries.highEstimate}), 0)`,
        totalActual: sql<number>`coalesce(sum(${budgetEntries.estimatedActual}), 0)`,
        totalPaid: sql<number>`coalesce(sum(${budgetEntries.amountPaid}), 0)`,
      })
      .from(budgetEntries);

    const [config] = await db.select().from(weddingConfig);
    const totalBudget = config?.budgetTotal ?? 0;

    // Recent activity (last 10 agent tasks)
    const recentTasks = await db
      .select()
      .from(agentTasks)
      .orderBy(sql`${agentTasks.createdAt} desc`)
      .limit(10);

    // Unread incoming messages
    const [unreadRow] = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(communications)
      .where(sql`${communications.direction} = 'in' AND ${communications.status} = 'received'`);

    return {
      vendors: {
        byStatus: vendorsByStatus,
        byCategory: vendorsByCategory,
        total: Object.values(vendorsByStatus).reduce((a, b) => a + b, 0),
      },
      budget: {
        total: totalBudget,
        allocated: budgetRows[0]?.totalAllocated ?? 0,
        actual: budgetRows[0]?.totalActual ?? 0,
        paid: budgetRows[0]?.totalPaid ?? 0,
        currency: config?.currency ?? "EUR",
      },
      recentActivity: recentTasks.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
      unreadMessages: unreadRow?.count ?? 0,
    };
  });

  router.register("dashboard.heartbeat-activity", async (db: Db, params: unknown) => {
    const { since } = (params as { since?: string } | undefined) ?? {};

    // Default to last 24 hours if no timestamp provided
    const sinceDate = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get heartbeat-research tasks since the given time
    const tasks = await db
      .select()
      .from(agentTasks)
      .where(sql`${agentTasks.type} = 'heartbeat-research' AND ${agentTasks.completedAt} > ${sinceDate}`)
      .orderBy(sql`${agentTasks.completedAt} desc`);

    // Extract vendor IDs and communication IDs from heartbeat task outputs
    const heartbeatVendorIds: number[] = [];
    const heartbeatCommIds: number[] = [];
    for (const task of tasks) {
      if (!task.output) continue;
      try {
        const output = JSON.parse(task.output);
        const data = output.data as { vendorIds?: number[]; toolCalls?: Array<{ toolName: string; result: unknown }> } | undefined;
        if (data?.vendorIds) {
          heartbeatVendorIds.push(...data.vendorIds);
        }
        if (data?.toolCalls) {
          for (const tc of data.toolCalls) {
            if (tc.toolName === "sendWhatsApp" && tc.result && typeof tc.result === "object") {
              const r = tc.result as { communicationId?: number };
              if (r.communicationId) heartbeatCommIds.push(r.communicationId);
            }
          }
        }
      } catch {
        // Ignore malformed output
      }
    }

    // Get vendors created by heartbeat-research
    let newVendors: Array<{ id: number; name: string; categoryName: string | null; status: string; createdAt: string }> = [];
    if (heartbeatVendorIds.length > 0) {
      newVendors = await db
        .select({
          id: vendors.id,
          name: vendors.name,
          categoryName: categories.name,
          status: vendors.status,
          createdAt: vendors.createdAt,
        })
        .from(vendors)
        .leftJoin(categories, sql`${vendors.categoryId} = ${categories.id}`)
        .where(sql`${vendors.id} IN (${sql.join(heartbeatVendorIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(sql`${vendors.createdAt} desc`);
    }

    // Get draft communications created by heartbeat-research
    let drafts: Array<{ id: number; vendorId: number; vendorName: string | null; channel: string; subject: string | null; bodyOriginal: string; status: string }> = [];
    if (heartbeatCommIds.length > 0) {
      drafts = await db
        .select({
          id: communications.id,
          vendorId: communications.vendorId,
          vendorName: vendors.name,
          channel: communications.channel,
          subject: communications.subject,
          bodyOriginal: communications.bodyOriginal,
          status: communications.status,
        })
        .from(communications)
        .leftJoin(vendors, sql`${communications.vendorId} = ${vendors.id}`)
        .where(sql`${communications.id} IN (${sql.join(heartbeatCommIds.map(id => sql`${id}`), sql`, `)}) AND ${communications.status} = 'draft'`)
        .orderBy(sql`${communications.id} desc`);
    }

    // Get sent communications created by heartbeat-research
    let sent: Array<{ id: number; vendorId: number; vendorName: string | null; channel: string; subject: string | null; sentAt: string | null }> = [];
    if (heartbeatCommIds.length > 0) {
      sent = await db
        .select({
          id: communications.id,
          vendorId: communications.vendorId,
          vendorName: vendors.name,
          channel: communications.channel,
          subject: communications.subject,
          sentAt: communications.sentAt,
        })
        .from(communications)
        .leftJoin(vendors, sql`${communications.vendorId} = ${vendors.id}`)
        .where(sql`${communications.id} IN (${sql.join(heartbeatCommIds.map(id => sql`${id}`), sql`, `)}) AND ${communications.status} = 'sent'`)
        .orderBy(sql`${communications.sentAt} desc`);
    }

    // Get heartbeat config for display
    const [config] = await db.select().from(heartbeatConfig).limit(1);

    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        status: t.status,
        summary: t.output ? JSON.parse(t.output).summary ?? null : null,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
      newVendors,
      drafts,
      sent,
      heartbeatEnabled: !!config?.enabled,
      lastRunAt: config?.lastRunAt ?? null,
    };
  });
}
