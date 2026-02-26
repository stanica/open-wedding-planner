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

export function createDbSchemaTool(sqlite: Database.Database) {
  return tool({
    description:
      "Inspect the database schema. Returns table names, columns, types, and foreign keys. Call with no arguments to list all tables, or pass a table name to get details for one table.",
    parameters: z.object({
      table: z.string().optional().describe("Table name to inspect. Omit to list all tables."),
    }),
    execute: async ({ table }) => {
      if (table) {
        const columns = sqlite.pragma(`table_info("${table}")`) as ColumnInfo[];
        if (columns.length === 0) {
          return { error: `Table "${table}" not found` };
        }
        const fks = sqlite.pragma(`foreign_key_list("${table}")`) as ForeignKeyInfo[];
        return {
          tables: [{
            name: table,
            columns: columns.map((c) => ({
              name: c.name,
              type: c.type,
              nullable: c.notnull === 0,
              primaryKey: c.pk === 1,
              defaultValue: c.dflt_value,
            })),
            foreignKeys: fks.map((fk) => ({
              column: fk.from,
              references: `${fk.table}.${fk.to}`,
            })),
          }],
        };
      }

      const rows = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' ORDER BY name")
        .all() as Array<{ name: string }>;

      const tables = rows.map((row) => {
        const columns = sqlite.pragma(`table_info("${row.name}")`) as ColumnInfo[];
        const fks = sqlite.pragma(`foreign_key_list("${row.name}")`) as ForeignKeyInfo[];
        return {
          name: row.name,
          columns: columns.map((c) => ({
            name: c.name,
            type: c.type,
            nullable: c.notnull === 0,
            primaryKey: c.pk === 1,
            defaultValue: c.dflt_value,
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
