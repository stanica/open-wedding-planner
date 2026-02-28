import type Database from "better-sqlite3";

/**
 * Build the text to embed for a given source table and row ID.
 * Returns null if the row doesn't exist or the table isn't embeddable.
 */
export function buildEmbeddingText(
  sqlite: Database.Database,
  sourceTable: string,
  sourceId: number,
): string | null {
  switch (sourceTable) {
    case "vendors":
      return buildVendorText(sqlite, sourceId);
    case "vendor_attributes":
      return buildVendorAttributesText(sqlite, sourceId);
    case "research_notes":
      return buildResearchNoteText(sqlite, sourceId);
    case "communications":
      return buildCommunicationText(sqlite, sourceId);
    case "quotes":
      return buildQuoteText(sqlite, sourceId);
    case "tasks":
      return buildTaskText(sqlite, sourceId);
    case "budget_entries":
      return buildBudgetEntryText(sqlite, sourceId);
    case "research_messages":
      return buildResearchMessageText(sqlite, sourceId);
    default:
      return null;
  }
}

function buildVendorText(sqlite: Database.Database, id: number): string | null {
  const row = sqlite
    .prepare(
      `SELECT v.name, v.description, v.location, v.notes, c.name as category
       FROM vendors v
       LEFT JOIN categories c ON c.id = v.category_id
       WHERE v.id = ?`,
    )
    .get(id) as
    | {
        name: string;
        description: string | null;
        location: string | null;
        notes: string | null;
        category: string | null;
      }
    | undefined;
  if (!row) return null;

  const parts = [row.name];
  if (row.category) parts.push(row.category);
  if (row.description) parts.push(row.description);
  if (row.location) parts.push(row.location);
  if (row.notes) parts.push(row.notes);
  return parts.join(". ");
}

function buildVendorAttributesText(
  sqlite: Database.Database,
  vendorId: number,
): string | null {
  const rows = sqlite
    .prepare(
      "SELECT key, value FROM vendor_attributes WHERE vendor_id = ? ORDER BY key",
    )
    .all(vendorId) as Array<{ key: string; value: string }>;
  if (rows.length === 0) return null;
  return rows.map((r) => `${r.key}: ${r.value}`).join(". ");
}

function buildResearchNoteText(
  sqlite: Database.Database,
  id: number,
): string | null {
  const row = sqlite
    .prepare("SELECT content FROM research_notes WHERE id = ?")
    .get(id) as { content: string } | undefined;
  return row?.content ?? null;
}

function buildCommunicationText(
  sqlite: Database.Database,
  id: number,
): string | null {
  const row = sqlite
    .prepare(
      "SELECT subject, body_original, body_translated FROM communications WHERE id = ?",
    )
    .get(id) as
    | {
        subject: string | null;
        body_original: string | null;
        body_translated: string | null;
      }
    | undefined;
  if (!row) return null;

  const parts: string[] = [];
  if (row.subject) parts.push(row.subject);
  const body = row.body_translated ?? row.body_original;
  if (body) parts.push(body);
  return parts.join(". ") || null;
}

function buildQuoteText(sqlite: Database.Database, id: number): string | null {
  const row = sqlite
    .prepare(
      `SELECT q.raw_text, v.name as vendor_name
       FROM quotes q
       LEFT JOIN vendors v ON v.id = q.vendor_id
       WHERE q.id = ?`,
    )
    .get(id) as
    | { raw_text: string | null; vendor_name: string | null }
    | undefined;
  if (!row) return null;

  const parts: string[] = [];
  if (row.vendor_name) parts.push(`${row.vendor_name} quote`);
  if (row.raw_text) parts.push(row.raw_text);

  const lineItems = sqlite
    .prepare("SELECT description FROM quote_line_items WHERE quote_id = ?")
    .all(id) as Array<{ description: string }>;
  if (lineItems.length > 0) {
    parts.push(
      "Line items: " + lineItems.map((li) => li.description).join(", "),
    );
  }

  return parts.join(". ") || null;
}

function buildTaskText(sqlite: Database.Database, id: number): string | null {
  const row = sqlite
    .prepare("SELECT title, notes FROM tasks WHERE id = ?")
    .get(id) as { title: string; notes: string | null } | undefined;
  if (!row) return null;

  const parts = [row.title];
  if (row.notes) parts.push(row.notes);
  return parts.join(". ");
}

function buildBudgetEntryText(
  sqlite: Database.Database,
  id: number,
): string | null {
  const row = sqlite
    .prepare(
      `SELECT be.description, be.notes, c.name as category
       FROM budget_entries be
       LEFT JOIN categories c ON c.id = be.category_id
       WHERE be.id = ?`,
    )
    .get(id) as
    | {
        description: string | null;
        notes: string | null;
        category: string | null;
      }
    | undefined;
  if (!row) return null;

  const parts: string[] = [];
  if (row.category) parts.push(row.category);
  if (row.description) parts.push(row.description);
  if (row.notes) parts.push(row.notes);
  return parts.join(". ") || null;
}

function buildResearchMessageText(
  sqlite: Database.Database,
  id: number,
): string | null {
  const row = sqlite
    .prepare("SELECT role, content FROM research_messages WHERE id = ?")
    .get(id) as { role: string; content: string } | undefined;
  if (!row || row.role === "system") return null;
  return row.content;
}
