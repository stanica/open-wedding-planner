# Semantic Search Design

## Overview

Add full semantic search across all DB data. Agents get a `semanticSearch` tool that performs vector similarity search against embedded content from all tables.

## Embedding Provider

- **Model:** OpenAI `text-embedding-3-small` (1536 dimensions, $0.02/1M tokens)
- **Configuration:** New `openai_api_key` column on `ai_config` table
- **SDK:** `@ai-sdk/openai` (already installed) + `embed()` from `ai` SDK
- **Wiring:** At startup, if `openaiApiKey` is present, call `setEmbedFn()` with an OpenAI-backed function. If absent, embedding operations silently no-op.

## Vector Storage Schema

Replace the unused `vendor_embeddings` + `vendor_embedding_map` tables with:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
  embedding float[1536]
);

CREATE TABLE IF NOT EXISTS embedding_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vec_rowid INTEGER NOT NULL,
  source_table TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  text_preview TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_table, source_id)
);
```

### Embedded content per table

| Source table | Embedded text |
|---|---|
| `vendors` | `"{name} - {category}. {description}. {location}. {notes}"` |
| `vendor_attributes` | All attributes concatenated per vendor. `source_id = vendor_id` |
| `research_notes` | `content` field |
| `communications` | `"{subject}. {body_translated or body_original}"` |
| `quotes` | `"{vendor_name} quote: {raw_text}. Line items: {descriptions}"` |
| `tasks` | `"{title}. {notes}"` |
| `budget_entries` | `"{category}: {description}. {notes}"` |
| `research_messages` | `content` (assistant messages only) |

## Embedding Generation: SQLite Triggers + Queue

### Pending queue table

```sql
CREATE TABLE IF NOT EXISTS pending_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_table TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  action TEXT NOT NULL DEFAULT 'upsert',  -- 'upsert' | 'delete'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Triggers

`AFTER INSERT`, `AFTER UPDATE`, and `AFTER DELETE` triggers on each embeddable table insert a row into `pending_embeddings`. Delete triggers set `action = 'delete'`.

### Flush

`EmbeddingService.flush()`:
1. Read pending rows from `pending_embeddings`
2. For upserts: fetch source row, build text, embed, upsert into `embeddings` + `embedding_map`
3. For deletes: remove from `embeddings` + `embedding_map`
4. Clear processed rows from queue
5. No-op if `embedFn` is null (no OpenAI key)

Flush runs after each agent step completes. OpenAI API failures leave the row in the queue for retry.

### Backfill

`EmbeddingService.backfill()` scans all embeddable tables and generates embeddings for rows missing from `embedding_map`. Called when OpenAI key is first configured.

## Semantic Search Tool

Factory tool registered as `semanticSearch`. Available to all agents.

**Input:**
- `query: string` — natural language search query
- `sourceType?: string` — optional filter (e.g. `'vendors'`, `'communications'`)
- `limit?: number` — default 10, max 20

**Behavior:**
1. Embed query text
2. KNN search against `embeddings` vec0 table
3. Join to `embedding_map` for source metadata
4. Optionally filter by `sourceType`
5. Fetch lightweight summary of each source row
6. Return `{ sourceTable, sourceId, distance, textPreview, summary }[]`

**Error:** If no OpenAI key, return `{ error: "Semantic search requires an OpenAI API key." }`

## EmbeddingService Class

Centralized service holding `sqlite` handle and `embedFn`. Methods:
- `upsert(sourceTable, sourceId, text)` — embed and store
- `remove(sourceTable, sourceId)` — remove embedding
- `flush()` — process pending queue
- `backfill()` — fill missing embeddings for all tables
- `search(query, sourceType?, limit?)` — perform semantic search

Instantiated once at startup, passed via context to the tool factory and runner.

## Testing

- Unit: EmbeddingService upsert/remove/flush/backfill/no-op
- Unit: Trigger queue population on INSERT/UPDATE/DELETE
- Unit: semanticSearch tool results, filtering, error handling
- Integration: write via dbQuery -> flush -> search -> verify results

## Files to create/modify

**New files:**
- `packages/gateway/src/db/embedding-service.ts` — EmbeddingService class
- `packages/gateway/src/tools/semantic-search.ts` — semanticSearch tool
- `packages/gateway/tests/db/embedding-service.test.ts`
- `packages/gateway/tests/tools/semantic-search.test.ts`

**Modified files:**
- `packages/gateway/src/db/schema.ts` — add `openai_api_key` to `ai_config`
- `packages/gateway/src/db/embeddings.ts` — rewrite for unified schema + triggers
- `packages/gateway/src/tools/index.ts` — register `semanticSearch`
- `packages/gateway/src/agents/task-configs.ts` — add `semanticSearch` to all agent tool lists
- `packages/gateway/src/agents/runner.ts` — add flush call after agent steps, add to ToolFactoryContext
- `packages/gateway/src/index.ts` — instantiate EmbeddingService, wire embedFn at startup
- `packages/gateway/src/handlers/ai-config.ts` — handle OpenAI key in config update, trigger backfill
- `packages/gateway/tests/db/embeddings.test.ts` — update for new schema
