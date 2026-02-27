# Browser Subagent Design

## Problem

The current `browse` tool does a single page load and text extraction — no clicking, form filling, or navigation. Wedding venue websites often require multi-page browsing (galleries, pricing pages, PDF downloads) to extract useful information.

## Solution

Replace `browse` with a **browser subagent** — an AI-driven agent that gets full Playwright browser control and runs asynchronously via the orchestrator. The parent research agent dispatches browser subagents and continues working while they run.

## Architecture

### New Tools for Parent Agent

**`dispatch(url, instructions, vendorId?)`**
- Spawns a browser subagent via `orchestrator.dispatch("browser", ...)`
- Returns `{ taskId }` immediately — non-blocking
- Parent can dispatch multiple subagents in parallel

**`awaitTasks(taskIds)`**
- Blocks until all specified tasks reach terminal status
- Returns `{ results: Array<{ taskId, status, summary }> }`

### Browser Subagent Task Config

New `"browser"` task config with:

**Tools — Playwright actions (shared page instance):**
- `navigate(url)` — go to URL, wait for networkidle
- `click(selector)` — click element
- `type(selector, text)` — fill text input
- `screenshot()` — base64 screenshot (LLM can see the page)
- `extractText(selector?)` — get text content
- `extractLinks()` — get all links with text
- `extractImages()` — get all image URLs
- `scroll(direction)` — scroll up/down
- `waitForSelector(selector)` — wait for element
- `evaluate(js)` — run JS in page context

**Tools — Data (same as research agent):**
- `addVendorImages`, `dbQuery`, `dbSchema`, `createVendor`

**Tools — PDF:**
- `parsePdf` — download and extract text from PDF links

**Max steps:** 20

**System prompt focus:** Navigate the target website, extract pricing/images/contact info, save data directly to DB via data tools. If PDF links found, parse them for pricing details.

### Browser Session Lifecycle

Extend `TaskConfig` with optional `setup`/`teardown` hooks:

```ts
interface TaskConfig {
  setup?: (toolCtx: ToolFactoryContext) => Promise<{
    extraTools: Record<string, Tool>;
    cleanup: () => Promise<void>;
  }>;
}
```

For the browser config, `setup`:
1. Launches Chromium headless
2. Creates a page, navigates to initial URL
3. Creates Playwright tools bound to that page
4. Returns tools + cleanup function (closes browser)

`AgentRunner` calls `setup()` before `generateText`, merges extra tools, calls `cleanup()` in `finally`.

### Orchestrator Integration

- `dispatch` and `awaitTasks` are **factory tools** receiving orchestrator via `ToolFactoryContext`
- Browser subagents run on a dedicated `"browser"` lane (parallel, non-blocking to main queue)
- `parentTaskId` set on child `agentTasks` records for traceability
- No thread saving — parent handles conversation persistence

### `awaitTasks` Implementation

Polls `agentTasks` table at ~500ms intervals until all tasks reach terminal status (completed/failed/cancelled). Returns summary from each task's output.

## Files Changed

| File | Change |
|------|--------|
| `tools/browser.ts` | Delete — replaced by playwright-tools |
| `tools/playwright-tools.ts` | New — 10 Playwright action tools, factory taking `Page` |
| `tools/dispatch.ts` | New — dispatch tool (factory, needs orchestrator) |
| `tools/await-tasks.ts` | New — awaitTasks tool (factory, needs db) |
| `tools/index.ts` | Register dispatch, awaitTasks; remove browse; keep parsePdf |
| `agents/task-configs.ts` | Add "browser" task config with system prompt, tools, setup/teardown |
| `agents/runner.ts` | Support setup/teardown hooks on TaskConfig |
| `agents/orchestrator.ts` | Add orchestrator to ToolFactoryContext |
| `agents/base-agent.ts` | Extend TaskConfig type with setup? |
| Research agent prompt | Replace browse with dispatch/awaitTasks instructions |

## Data Flow

```
Parent research agent
  ├─ search("venues in Tuscany") → results
  ├─ scrape("https://simple-venue.com") → text (simple site)
  ├─ dispatch("https://fancy-venue.com", "find pricing & gallery", vendorId=42) → taskId "abc"
  ├─ dispatch("https://another-venue.com", "find images & menus", vendorId=55) → taskId "def"
  ├─ createVendor(...) → vendorId 60  (continues working)
  └─ awaitTasks(["abc", "def"]) → summaries from both subagents

Browser subagent (taskId "abc")
  ├─ navigate("https://fancy-venue.com")
  ├─ extractLinks() → sees "Pricing" link
  ├─ click("a:text('Pricing')")
  ├─ extractText() → pricing details
  ├─ parsePdf("https://fancy-venue.com/menu.pdf") → menu text
  ├─ navigate("https://fancy-venue.com/gallery")
  ├─ extractImages() → image URLs
  ├─ addVendorImages(vendorId=42, images=[...])
  ├─ dbQuery("UPDATE vendors SET ...") → saved pricing
  └─ returns summary to parent
```
