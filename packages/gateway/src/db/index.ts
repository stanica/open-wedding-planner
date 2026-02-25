import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "./schema.js";
import { getDbPath } from "../config/paths.js";

export function createDatabase(dbPath?: string) {
  const db = new Database(dbPath ?? getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);
  return drizzle(db, { schema });
}
