import { tool } from "ai";
import { z } from "zod";
import type Database from "better-sqlite3";
import type { PermissionCallbacks } from "./permission-wrapper.js";

const MAX_ROWS = 100;
const SQL_BLACKLIST = ["DROP", "ALTER", "PRAGMA", "ATTACH", "DETACH"];

function stripLeadingComments(sql: string): string {
  let s = sql.trimStart();
  while (true) {
    if (s.startsWith("--")) {
      const nl = s.indexOf("\n");
      s = (nl === -1 ? "" : s.slice(nl + 1)).trimStart();
    } else if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      s = (end === -1 ? "" : s.slice(end + 2)).trimStart();
    } else {
      break;
    }
  }
  return s;
}

export function isBlacklistedSql(sql: string): boolean {
  const trimmed = stripLeadingComments(sql).toUpperCase();
  return SQL_BLACKLIST.some((keyword) => trimmed.startsWith(keyword));
}

function getBlacklistedKeyword(sql: string): string {
  const trimmed = stripLeadingComments(sql).toUpperCase();
  return SQL_BLACKLIST.find((keyword) => trimmed.startsWith(keyword)) ?? "UNKNOWN";
}

export function createDbQueryTool(sqlite: Database.Database, permissionCallbacks: PermissionCallbacks) {
  return tool({
    description:
      "Execute a SQL query against the application database. Use the dbSchema tool first to understand the table structure. Supports SELECT, INSERT, UPDATE, DELETE. Destructive DDL (DROP, ALTER) requires explicit permission.",
    inputSchema: z.object({
      sql: z.string().describe("The SQL query to execute"),
      params: z.array(z.unknown()).optional().default([]).describe("Bind parameters for the query"),
    }),
    execute: async ({ sql: query, params = [] }) => {
      if (isBlacklistedSql(query)) {
        const keyword = getBlacklistedKeyword(query);
        const response = await permissionCallbacks.requestPermission(`dbQuery:${keyword}`, query);
        if (response === "deny") {
          return { error: `SQL "${keyword}" denied by user. Try an alternative approach.` };
        }
      }

      try {
        const trimmed = query.trimStart().toUpperCase();
        const isRead = trimmed.startsWith("SELECT") || trimmed.startsWith("WITH") || trimmed.startsWith("EXPLAIN");

        if (isRead) {
          const stmt = sqlite.prepare(query);
          const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
          const truncated = rows.length > MAX_ROWS;
          return {
            rows: truncated ? rows.slice(0, MAX_ROWS) : rows,
            rowCount: rows.length,
            truncated,
          };
        } else {
          const stmt = sqlite.prepare(query);
          const info = params.length > 0 ? stmt.run(...params) : stmt.run();
          return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  });
}
