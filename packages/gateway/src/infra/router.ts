import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

export type Handler = (db: Db, params: unknown) => Promise<unknown>;

export class Router {
  private handlers = new Map<string, Handler>();

  register(method: string, handler: Handler) {
    this.handlers.set(method, handler);
  }

  async handle(db: Db, method: string, params: unknown): Promise<unknown> {
    const handler = this.handlers.get(method);
    if (!handler) {
      throw new Error(`Unknown method: ${method}`);
    }
    return handler(db, params);
  }

  has(method: string): boolean {
    return this.handlers.has(method);
  }
}
