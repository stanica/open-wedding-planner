import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const weddingConfig = sqliteTable("wedding_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weddingDate: text("wedding_date"),
  guestCount: integer("guest_count"),
  budgetTotal: real("budget_total"),
  currency: text("currency").default("EUR").notNull(),
  coupleNames: text("couple_names"),
  coupleEmail: text("couple_email"),
  location: text("location"),
  languagePreferences: text("language_preferences").default('["en","it"]').notNull(),
  dietaryRequirements: text("dietary_requirements"),
  alcoholPreferences: text("alcohol_preferences"),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  budgetPercentLow: real("budget_percent_low").notNull(),
  budgetPercentHigh: real("budget_percent_high").notNull(),
  budgetFixed: real("budget_fixed"),
  sortOrder: integer("sort_order").notNull(),
});

export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  name: text("name").notNull(),
  location: text("location"),
  websiteUrl: text("website_url"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  contactWhatsapp: text("contact_whatsapp"),
  description: text("description"),
  notes: text("notes"),
  sourceUrl: text("source_url"),
  status: text("status").notNull().default("researched"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const vendorAttributes = sqliteTable("vendor_attributes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id),
  key: text("key").notNull(),
  value: text("value").notNull(),
  type: text("type").notNull().default("text"),
});

export const quotes = sqliteTable("quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id),
  totalAmount: real("total_amount").notNull(),
  currency: text("currency").notNull().default("EUR"),
  validUntil: text("valid_until"),
  rawText: text("raw_text"),
  source: text("source").notNull(),
  receivedAt: text("received_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const quoteLineItems = sqliteTable("quote_line_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quoteId: integer("quote_id")
    .notNull()
    .references(() => quotes.id),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  pricingType: text("pricing_type").notNull().default("flat"),
  unitPrice: real("unit_price"),
  quantity: real("quantity"),
  notes: text("notes"),
});

export const communications = sqliteTable("communications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id),
  direction: text("direction").notNull(),
  channel: text("channel").notNull(),
  subject: text("subject"),
  bodyOriginal: text("body_original").notNull(),
  bodyTranslated: text("body_translated"),
  language: text("language"),
  sentAt: text("sent_at"),
  status: text("status").notNull().default("draft"),
  threadId: text("thread_id"),
  parsedAt: text("parsed_at"),
});

export const researchNotes = sqliteTable("research_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id),
  content: text("content").notNull(),
  sourceUrl: text("source_url"),
  sourceType: text("source_type"),
  extractedData: text("extracted_data"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const budgetEntries = sqliteTable("budget_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  vendorId: integer("vendor_id").references(() => vendors.id),
  description: text("description").notNull(),
  highEstimate: real("high_estimate"),
  lowEstimate: real("low_estimate"),
  estimatedActual: real("estimated_actual"),
  amountPaid: real("amount_paid"),
  balanceDue: real("balance_due"),
  finalPaymentDue: text("final_payment_due"),
  paidBy: text("paid_by"),
  notes: text("notes"),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  owner: text("owner"),
  status: text("status").notNull().default("pending"),
  deadline: text("deadline"),
  categoryId: integer("category_id").references(() => categories.id),
  vendorId: integer("vendor_id").references(() => vendors.id),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const agentTasks = sqliteTable("agent_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  sessionId: text("session_id"),
  input: text("input"),
  output: text("output"),
  parentTaskId: integer("parent_task_id"),
  vendorId: integer("vendor_id").references(() => vendors.id),
  categoryId: integer("category_id").references(() => categories.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  context: text("context"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  lastActiveAt: text("last_active_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const aiConfig = sqliteTable("ai_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().default("api-key"),
  model: text("model").notNull().default("claude-sonnet-4-20250514"),
  proxyUrl: text("proxy_url").notNull().default("http://localhost:3456/v1"),
});
