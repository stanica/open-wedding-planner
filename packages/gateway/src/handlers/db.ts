import type Database from "better-sqlite3";
import type { Router } from "../infra/router.js";

export function registerDbHandlers(router: Router, sqlite: Database.Database) {
  const getTableNames = (): string[] => {
    const rows = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  };

  const assertValidTable = (table: string) => {
    const tables = getTableNames();
    if (!tables.includes(table)) {
      throw new Error(`Invalid table: ${table}`);
    }
  };

  const getColumnNames = (table: string): string[] => {
    const cols = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as {
      name: string;
    }[];
    return cols.map((c) => c.name);
  };

  router.register("db.tables", async () => {
    return getTableNames();
  });

  router.register("db.query", async (_db, params) => {
    const { table, limit = 50, offset = 0 } = params as {
      table: string;
      limit?: number;
      offset?: number;
    };
    assertValidTable(table);

    const columns = getColumnNames(table);
    const rows = sqlite
      .prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`)
      .all(limit, offset) as Record<string, unknown>[];
    const { total } = sqlite
      .prepare(`SELECT COUNT(*) as total FROM "${table}"`)
      .get() as { total: number };

    return { columns, rows, total };
  });
}
