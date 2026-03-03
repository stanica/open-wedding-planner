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
  otherInfo: text("other_info"),
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
  imageUrl: text("image_url"),
  threadId: integer("thread_id"),
  favorite: integer("favorite").notNull().default(0),
  status: text("status").notNull().default("researched"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const vendorImages = sqliteTable("vendor_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalUrl: text("original_url"),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
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
  isRead: integer("is_read").notNull().default(0),
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
  provider: text("provider").notNull().default("anthropic"),
  baseUrl: text("base_url"),
  model: text("model").notNull().default("claude-sonnet-4-20250514"),
  apiKey: text("api_key"),
  openaiApiKey: text("openai_api_key"),
  whatsappAutoSend: integer("whatsapp_auto_send").notNull().default(0),
  whatsappActiveThreadId: integer("whatsapp_active_thread_id"),
  vapiApiKey: text("vapi_api_key"),
  vapiPhoneNumberId: text("vapi_phone_number_id"),
  vapiAssistantId: text("vapi_assistant_id"),
  vapiAutoCall: integer("vapi_auto_call").default(0),
});

export const researchThreads = sqliteTable("research_threads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  categoryTags: text("category_tags"),
  lastInputTokens: integer("last_input_tokens"),
  lastContextWindow: integer("last_context_window"),
  lastModelName: text("last_model_name"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const researchMessages = sqliteTable("research_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: integer("thread_id")
    .notNull()
    .references(() => researchThreads.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  vendorIds: text("vendor_ids"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const toolPermissions = sqliteTable("tool_permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolName: text("tool_name").notNull().unique(),
  decision: text("decision").notNull().default("prompt"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const searchConfig = sqliteTable("search_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().default("duckduckgo"),
  apiKey: text("api_key"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const heartbeatConfig = sqliteTable("heartbeat_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  enabled: integer("enabled").notNull().default(0),
  prompt: text("prompt"),
  intervalMinutes: integer("interval_minutes").notNull().default(30),
  lastRunAt: text("last_run_at"),
});

export const guardrailsConfig = sqliteTable("guardrails_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  enabled: integer("enabled").notNull().default(0),
  config: text("config"),
});

export const googleConfig = sqliteTable("google_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountEmail: text("account_email"),
  services: text("services").default("gmail").notNull(),
  credentialsPath: text("credentials_path"),
  autoSend: integer("auto_send").notNull().default(0),
});

export const voiceCalls = sqliteTable("voice_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendor_id").references(() => vendors.id),
  vapiCallId: text("vapi_call_id"),
  phoneNumber: text("phone_number").notNull(),
  assistantId: text("assistant_id"),
  status: text("status").notNull().default("draft"),
  endedReason: text("ended_reason"),
  duration: integer("duration"),
  summary: text("summary"),
  transcript: text("transcript"),
  recordingUrl: text("recording_url"),
  structuredData: text("structured_data"),
  instructions: text("instructions"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  endedAt: text("ended_at"),
});
