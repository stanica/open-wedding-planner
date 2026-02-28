import { tool } from "ai";
import { z } from "zod";
import type Database from "better-sqlite3";

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface ForeignKeyInfo {
  table: string;
  from: string;
  to: string;
}

/** Extract CHECK constraints from a CREATE TABLE DDL string */
function parseCheckConstraints(ddl: string): Record<string, string[]> {
  const constraints: Record<string, string[]> = {};
  // Match patterns like: column_name TEXT NOT NULL CHECK(column_name IN ('a', 'b', 'c'))
  const re = /(\w+)\s+TEXT[^,]*CHECK\(\1\s+IN\s*\(([^)]+)\)\)/gi;
  let match;
  while ((match = re.exec(ddl)) !== null) {
    const column = match[1];
    const values = match[2]
      .split(",")
      .map((v) => v.trim().replace(/^'|'$/g, ""));
    constraints[column] = values;
  }
  return constraints;
}

export function createDbSchemaTool(sqlite: Database.Database) {
  return tool({
    description:
      "Inspect the database schema. Returns table names, columns, types, and foreign keys. Call with no arguments to list all tables, or pass a table name to get details for one table.",
    parameters: z.object({
      table: z.string().optional().describe("Table name to inspect. Omit to list all tables."),
    }),
    execute: async ({ table }) => {
      if (table) {
        // Validate table name against sqlite_master to prevent injection
        const tableRow = sqlite
          .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?")
          .get(table) as { sql: string } | undefined;
        if (!tableRow) {
          return { error: `Table "${table}" not found` };
        }
        const columns = sqlite.pragma(`table_info("${table}")`) as ColumnInfo[];
        const fks = sqlite.pragma(`foreign_key_list("${table}")`) as ForeignKeyInfo[];
        const checks = parseCheckConstraints(tableRow.sql);
        return {
          tables: [{
            name: table,
            columns: columns.map((c) => ({
              name: c.name,
              type: c.type,
              nullable: c.notnull === 0,
              primaryKey: c.pk === 1,
              defaultValue: c.dflt_value,
              ...(checks[c.name] ? { validValues: checks[c.name] } : {}),
            })),
            foreignKeys: fks.map((fk) => ({
              column: fk.from,
              references: `${fk.table}.${fk.to}`,
            })),
          }],
        };
      }

      const rows = sqlite
        .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' ORDER BY name")
        .all() as Array<{ name: string; sql: string }>;

      const tables = rows.map((row) => {
        const columns = sqlite.pragma(`table_info("${row.name}")`) as ColumnInfo[];
        const fks = sqlite.pragma(`foreign_key_list("${row.name}")`) as ForeignKeyInfo[];
        const checks = parseCheckConstraints(row.sql);
        return {
          name: row.name,
          columns: columns.map((c) => ({
            name: c.name,
            type: c.type,
            nullable: c.notnull === 0,
            primaryKey: c.pk === 1,
            defaultValue: c.dflt_value,
            ...(checks[c.name] ? { validValues: checks[c.name] } : {}),
          })),
          foreignKeys: fks.map((fk) => ({
            column: fk.from,
            references: `${fk.table}.${fk.to}`,
          })),
        };
      });

      return { tables };
    },
  });
}
