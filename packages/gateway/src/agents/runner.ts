import { generateText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import type { TaskConfig, AgentContext, AgentResult } from "./base-agent.js";
import { getModel, getSubagentModel, getBuiltInTools, getContextWindowForModel, getSummarizationModel, getAIConfig } from "./model-provider.js";
import { wrapToolWithPermission } from "../tools/permission-wrapper.js";
import { StuckError } from "./safety/guardrails.js";

function isContextOverflowError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("prompt is too long") || msg.includes("context_length_exceeded") || msg.includes("request too large");
}

/** ~25K tokens — leaves plenty of room for system prompt + conversation history */
const MAX_TOOL_RESULT_CHARS = 100_000;

function truncateToolResult(result: unknown): unknown {
  const serialized = JSON.stringify(result);
  if (serialized.length <= MAX_TOOL_RESULT_CHARS) return result;
  return {
    _truncated: true,
    _originalChars: serialized.length,
    data: serialized.slice(0, MAX_TOOL_RESULT_CHARS),
    notice: "Output was truncated because it exceeded the size limit. Request less data or use more specific queries.",
  };
}

/** Wrap a tool's execute to cap result size before the SDK feeds it back to the model */
function withTruncation(t: any): any {
  const orig = t.execute;
  if (typeof orig !== "function") return t;
  return { ...t, execute: async (...args: any[]) => truncateToolResult(await orig(...args)) };
}

export interface ToolFactoryContext {
  db: unknown;
  emit: (action: string, detail?: string) => void;
  sqlite: unknown;
  workspaceDir: string;
  permissionCallbacks: unknown;
  deliveryQueue?: unknown;
  getAutoSend?: () => boolean;
  orchestrator?: unknown;
  parentSessionKey?: string;
  threadId?: number;
  broadcast?: (event: any) => void;
  embeddingService?: unknown;
}

export class AgentRunner {
  async run(
    config: TaskConfig,
    ctx: AgentContext,
    messages: ModelMessage[],
    toolCtx: ToolFactoryContext,
  ): Promise<AgentResult> {
    ctx.emit("starting", `Running ${config.name}...`);

    let cleanup: (() => Promise<void>) | undefined;

    try {
      // Build wrapped tool set from config
      const tools: Record<string, any> = {};

      // Call setup hook if present — BEFORE building other tools
      // Setup-provided tools (e.g. Playwright browser actions) are internal and
      // don't require user permission — skip the permission wrapper.
      if (config.setup) {
        const setupResult = await config.setup(toolCtx);
        cleanup = setupResult.cleanup;
        Object.assign(tools, setupResult.extraTools);
      }

      const builtInTools = await getBuiltInTools(ctx.emit);

      // Exclude custom search/scrape when built-in alternatives are available
      const customToolNames = builtInTools
        ? config.tools.filter((t) => t !== "search" && t !== "scrape")
        : config.tools;

      if (customToolNames.length > 0) {
        const rawTools = ctx.toolRegistry.getToolSetWithContext(customToolNames, toolCtx);
        for (const [name, t] of Object.entries(rawTools)) {
          tools[name] = wrapToolWithPermission(t, name, ctx.permissionManager, ctx.permissionCallbacks);
        }
      }

      // Merge built-in tools (server-side execution, no permission wrapping)
      if (builtInTools) {
        Object.assign(tools, builtInTools);
      }

      // Wrap all tools to truncate oversized results before they hit the model
      // Skip dbSchema — the agent always needs the full schema to write correct queries
      for (const [name, t] of Object.entries(tools)) {
        if (name === "dbSchema") continue;
        tools[name] = withTruncation(t);
      }

      // When built-in tools aren't available (claude-max proxy), tell the model
      // to use the custom tools instead of asking for its built-in web_search/web_fetch
      let systemPrompt = config.systemPrompt;
      if (!builtInTools) {
        systemPrompt += "\n\nIMPORTANT: Use the provided tools (search, scrape, dispatch) for web access. Do NOT ask the user to enable WebSearch, WebFetch, or any built-in tools — they are not available. Use the tools you have.";
      }

      const model = config.model === "subagent" ? await getSubagentModel() : await getModel();

      // Accumulate tool calls progressively so they survive abort
      const allToolCalls: Array<{ toolName: string; args: unknown; result: unknown }> = [];
      const vendorIds: number[] = [];

      const onStepFinish = ({ toolCalls: stepToolCalls, toolResults: stepToolResults, usage: stepUsage }: any) => {
        // Emit events for debug console
        for (const tc of stepToolCalls) {
          ctx.emit("tool-call", `${tc.toolName}: ${JSON.stringify(tc.input).slice(0, 500)}`);
        }
        for (const tr of stepToolResults) {
          ctx.emit("tool-result", `${(tr as any).toolName}: ${JSON.stringify((tr as any).output).slice(0, 500)}`);
        }

        // Accumulate completed tool calls
        for (const tc of stepToolCalls) {
          const tr = stepToolResults.find((r: any) => r.toolCallId === tc.toolCallId);
          allToolCalls.push({ toolName: tc.toolName, args: tc.input, result: tr?.output });
          if (tc.toolName === "createVendor" && tr?.output && typeof tr.output === "object") {
            const r = tr.output as { vendorId?: number };
            if (r.vendorId) vendorIds.push(r.vendorId);
          }
        }

        // Run guardrails: check each tool call against history, then record its outcome
        for (const tc of stepToolCalls) {
          const { record, signal } = ctx.guardrails.preToolCheck(tc.toolName, tc.input);
          const tr = stepToolResults.find((r: any) => r.toolCallId === tc.toolCallId);
          if (tr) {
            ctx.guardrails.recordOutcome(record, (tr as any).output);
          }
          if (signal) {
            if (signal.severity === "critical") {
              throw new StuckError(signal);
            }
            ctx.emit("warning", `Guardrail: ${signal.message}`);
          }
        }

        // Emit token usage for live UI updates
        if (toolCtx.broadcast && toolCtx.threadId && stepUsage) {
          const modelName = getAIConfig().model;
          const contextWindow = getContextWindowForModel(modelName);
          toolCtx.broadcast({
            name: "research.tokenUsage",
            data: {
              threadId: toolCtx.threadId,
              sessionKey: toolCtx.parentSessionKey ?? "",
              inputTokens: stepUsage.promptTokens ?? stepUsage.totalTokens ?? 0,
              contextWindow,
              modelName,
            },
          });
        }
      };

      const toolsOption = Object.keys(tools).length > 0 ? tools : undefined;

      let text = "";
      let usage: { inputTokens?: number } | undefined;

      try {
        const result = await generateText({
          model,
          system: systemPrompt,
          messages,
          tools: toolsOption,
          stopWhen: stepCountIs(200),
          abortSignal: ctx.signal,
          onStepFinish,
        });

        text = result.text;
        usage = result.usage;
      } catch (err) {
        // On abort, return partial result with whatever tool calls completed
        if (err instanceof Error && err.name === "AbortError") {
          ctx.emit("complete", `${config.name} stopped by user`);
          return {
            summary: "Stopped by user",
            data: { toolCalls: allToolCalls, vendorIds },
            aborted: true,
          };
        }

        // On context overflow, retry with a hint about the oversized tool result
        if (isContextOverflowError(err) && allToolCalls.length > 0) {
          const lastTool = allToolCalls[allToolCalls.length - 1];
          ctx.emit("warning", `Context overflow after ${lastTool.toolName} — retrying with smaller context`);

          // Build a summary of tool calls so far for context
          const toolSummary = allToolCalls.map((tc) => {
            const resultPreview = tc.result ? JSON.stringify(tc.result).slice(0, 200) : "no result";
            return `- ${tc.toolName}(${JSON.stringify(tc.args).slice(0, 200)}): ${resultPreview}`;
          }).join("\n");

          const retryMessages: ModelMessage[] = [
            ...messages,
            {
              role: "assistant" as const,
              content: `I was working on this and made the following tool calls:\n${toolSummary}\n\nMy last tool call (${lastTool.toolName}) returned a result that exceeded the context window. I need to retry with more specific parameters to get a smaller result.`,
            },
            {
              role: "user" as const,
              content: "Continue — use more specific queries or request less data to avoid exceeding the context limit.",
            },
          ];

          try {
            const retryResult = await generateText({
              model,
              system: systemPrompt,
              messages: retryMessages,
              tools: toolsOption,
              stopWhen: stepCountIs(200),
              abortSignal: ctx.signal,
              onStepFinish,
            });

            text = retryResult.text;
            usage = retryResult.usage;
          } catch (retryErr) {
            if (retryErr instanceof Error && retryErr.name === "AbortError") {
              ctx.emit("complete", `${config.name} stopped by user`);
              return {
                summary: "Stopped by user",
                data: { toolCalls: allToolCalls, vendorIds },
                aborted: true,
              };
            }
            throw retryErr;
          }
        } else {
          throw err;
        }
      }

      ctx.emit("complete", `${config.name} finished`);

      // Check if context needs compaction
      let compactionSummary: string | undefined;
      if (usage?.inputTokens) {
        const modelName = getAIConfig().model;
        const contextWindow = getContextWindowForModel(modelName);
        const threshold = contextWindow * 0.8;

        if (usage.inputTokens > threshold) {
          ctx.emit("compacting", `Context at ${Math.round((usage.inputTokens / contextWindow) * 100)}% — summarizing conversation...`);
          try {
            const summarizationModel = await getSummarizationModel();
            const { text: summary } = await generateText({
              model: summarizationModel,
              system: `You are summarizing a conversation between a user and a wedding planning research assistant. Produce a concise summary that preserves:
- All vendor names, pricing, and contact details discovered
- Key decisions and preferences expressed by the user
- Outstanding questions or next steps
- Any important context about the wedding (date, location, guest count, budget)

Be thorough but concise. This summary will replace the conversation history for future interactions.`,
              messages: [
                {
                  role: "user",
                  content: messages
                    .map((m) => `[${m.role}]: ${"content" in m && typeof m.content === "string" ? m.content : JSON.stringify(m)}`)
                    .join("\n\n"),
                },
              ],
              abortSignal: ctx.signal,
            });
            compactionSummary = summary;
          } catch (err) {
            ctx.emit("warning", `Context compaction failed: ${err instanceof Error ? err.message : "unknown error"}`);
          }
        }
      }

      const modelName = getAIConfig().model;
      const contextWindow = getContextWindowForModel(modelName);
      return {
        summary: text || `${config.name} completed`,
        data: { toolCalls: allToolCalls, vendorIds },
        compactionSummary,
        lastTokenUsage: usage?.inputTokens ? {
          inputTokens: usage.inputTokens,
          contextWindow,
          modelName,
        } : undefined,
      };
    } finally {
      if (cleanup) {
        await cleanup();
      }
    }
  }
}
