import type Database from "better-sqlite3";

/**
 * Push the full schema to a raw SQLite database.
 * Used for both in-memory test DBs and first-run production DBs.
 */
export function pushSchema(sqlite: Database.Database) {
  sqlite.exec(`
    -- Incremental migrations for existing databases
    -- SQLite ignores ALTER TABLE ADD COLUMN if column already exists (we catch the error)
  `);

  // Add thread_id to vendors if it doesn't exist (existing DBs won't have it)
  try {
    sqlite.exec(`ALTER TABLE vendors ADD COLUMN thread_id INTEGER`);
  } catch {
    // Column already exists — ignore
  }

  try {
    sqlite.exec(`ALTER TABLE vendors ADD COLUMN image_url TEXT`);
  } catch {
    // Column already exists — ignore
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS wedding_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wedding_date TEXT,
      guest_count INTEGER,
      budget_total REAL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      couple_names TEXT,
      couple_email TEXT,
      location TEXT,
      language_preferences TEXT NOT NULL DEFAULT '["en","it"]',
      dietary_requirements TEXT,
      alcohol_preferences TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      budget_percent_low REAL NOT NULL,
      budget_percent_high REAL NOT NULL,
      budget_fixed REAL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      location TEXT,
      website_url TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      contact_whatsapp TEXT,
      description TEXT,
      notes TEXT,
      source_url TEXT,
      image_url TEXT,
      thread_id INTEGER,
      favorite INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'researched',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendor_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_url TEXT,
      caption TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendor_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text'
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      total_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      valid_until TEXT,
      raw_text TEXT,
      source TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quote_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES quotes(id),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      pricing_type TEXT NOT NULL DEFAULT 'flat',
      unit_price REAL,
      quantity REAL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS communications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
      channel TEXT NOT NULL CHECK(channel IN ('email', 'whatsapp')),
      subject TEXT,
      body_original TEXT NOT NULL,
      body_translated TEXT,
      language TEXT,
      sent_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'sent', 'received', 'rejected', 'pending_approval')),
      thread_id TEXT,
      parsed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS research_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      content TEXT NOT NULL,
      source_url TEXT,
      source_type TEXT,
      extracted_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budget_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      vendor_id INTEGER REFERENCES vendors(id),
      description TEXT NOT NULL,
      high_estimate REAL,
      low_estimate REAL,
      estimated_actual REAL,
      amount_paid REAL,
      balance_due REAL,
      final_payment_due TEXT,
      paid_by TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      owner TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      deadline TEXT,
      category_id INTEGER REFERENCES categories(id),
      vendor_id INTEGER REFERENCES vendors(id),
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      session_id TEXT,
      input TEXT,
      output TEXT,
      parent_task_id INTEGER,
      vendor_id INTEGER REFERENCES vendors(id),
      category_id INTEGER REFERENCES categories(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      context TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'api-key',
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
      proxy_url TEXT NOT NULL DEFAULT 'http://localhost:3456/v1',
      api_key TEXT,
      whatsapp_auto_send INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS research_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category_tags TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS research_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL REFERENCES research_threads(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      vendor_ids TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tool_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL UNIQUE,
      decision TEXT NOT NULL DEFAULT 'prompt',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS search_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'duckduckgo',
      api_key TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS heartbeat_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enabled INTEGER NOT NULL DEFAULT 0,
      prompt TEXT,
      interval_minutes INTEGER NOT NULL DEFAULT 30,
      last_run_at TEXT
    );

    CREATE TABLE IF NOT EXISTS google_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_email TEXT,
      services TEXT NOT NULL DEFAULT 'gmail',
      credentials_path TEXT,
      auto_send INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS guardrails_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enabled INTEGER NOT NULL DEFAULT 0,
      config TEXT
    );
  `);

  // Migrations for existing databases
  try {
    sqlite.exec(`ALTER TABLE ai_config ADD COLUMN api_key TEXT;`);
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE ai_config ADD COLUMN whatsapp_auto_send INTEGER NOT NULL DEFAULT 0;`);
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE ai_config ADD COLUMN whatsapp_active_thread_id INTEGER;`);
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE vendors ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;`);
  } catch {
    // Column already exists
  }

  // Normalize direction values and add CHECK constraints to communications table
  migrateCommunicationsConstraints(sqlite);
}

function migrateCommunicationsConstraints(sqlite: Database.Database) {
  // Check if the table already has CHECK constraints by inspecting the DDL
  const row = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='communications'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("CHECK")) return; // Already has constraints or table doesn't exist

  // Normalize existing direction values
  sqlite.exec(`UPDATE communications SET direction = 'in' WHERE direction = 'inbound';`);
  sqlite.exec(`UPDATE communications SET direction = 'out' WHERE direction = 'outbound';`);

  // Recreate table with CHECK constraints (SQLite doesn't support ALTER TABLE ADD CHECK)
  sqlite.exec(`
    DROP TABLE IF EXISTS communications_new;
    CREATE TABLE communications_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
      channel TEXT NOT NULL CHECK(channel IN ('email', 'whatsapp')),
      subject TEXT,
      body_original TEXT NOT NULL,
      body_translated TEXT,
      language TEXT,
      sent_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'sent', 'received', 'rejected', 'pending_approval')),
      thread_id TEXT,
      parsed_at TEXT
    );
    INSERT INTO communications_new (id, vendor_id, direction, channel, subject, body_original, body_translated, language, sent_at, status, thread_id)
      SELECT id, vendor_id, direction, channel, subject, body_original, body_translated, language, sent_at, status, thread_id FROM communications;
    DROP TABLE communications;
    ALTER TABLE communications_new RENAME TO communications;
  `);
}
