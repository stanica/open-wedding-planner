import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { pushSchema } from "../../src/db/migrate.js";
import { createDbSchemaTool } from "../../src/tools/db-schema.js";

describe("dbSchema tool", () => {
  let sqlite: InstanceType<typeof Database>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqliteVec.load(sqlite);
    pushSchema(sqlite);
  });

  it("returns all tables when no table param given", async () => {
    const schemaTool = createDbSchemaTool(sqlite);
    const result = await schemaTool.execute!(
      {},
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const tables = result as { tables: Array<{ name: string }> };
    const names = tables.tables.map((t) => t.name);
    expect(names).toContain("vendors");
    expect(names).toContain("categories");
    expect(names).toContain("communications");
  });

  it("returns columns for a specific table", async () => {
    const schemaTool = createDbSchemaTool(sqlite);
    const result = await schemaTool.execute!(
      { table: "vendors" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    const schema = result as { tables: Array<{ name: string; columns: Array<{ name: string; type: string }> }> };
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0].name).toBe("vendors");
    const colNames = schema.tables[0].columns.map((c) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("name");
    expect(colNames).toContain("contact_email");
  });

  it("returns error for unknown table", async () => {
    const schemaTool = createDbSchemaTool(sqlite);
    const result = await schemaTool.execute!(
      { table: "nonexistent" },
      { toolCallId: "t1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result).toMatchObject({ error: expect.stringContaining("nonexistent") });
  });
});
