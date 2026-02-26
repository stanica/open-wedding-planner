import { generateText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import type { TaskConfig, AgentContext, AgentResult } from "./base-agent.js";
import { getModel } from "./model-provider.js";
import { wrapToolWithPermission } from "../tools/permission-wrapper.js";

export interface ToolFactoryContext {
  db: unknown;
  emit: (action: string, detail?: string) => void;
  sqlite: unknown;
  workspaceDir: string;
  permissionCallbacks: unknown;
}

export class AgentRunner {
  async run(
    config: TaskConfig,
    ctx: AgentContext,
    messages: ModelMessage[],
    toolCtx: ToolFactoryContext,
  ): Promise<AgentResult> {
    ctx.emit("starting", `Running ${config.name}...`);

    // Build wrapped tool set from config
    const tools: Record<string, any> = {};
    if (config.tools.length > 0) {
      const rawTools = ctx.toolRegistry.getToolSetWithContext(config.tools, toolCtx);
      for (const [name, t] of Object.entries(rawTools)) {
        tools[name] = wrapToolWithPermission(t, name, ctx.permissionManager, ctx.permissionCallbacks);
      }
    }

    const model = await getModel();
    const maxSteps = config.maxSteps ?? 15;

    const { text, steps } = await generateText({
      model,
      system: config.systemPrompt,
      messages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: ctx.signal,
      onStepFinish: ({ toolCalls: stepToolCalls }) => {
        for (const tc of stepToolCalls) {
          ctx.emit("tool-call", `${tc.toolName}: ${JSON.stringify(tc.input).slice(0, 100)}`);
        }
      },
    });

    // Collect all tool calls from steps
    const allToolCalls: Array<{ toolName: string; args: unknown; result: unknown }> = [];
    for (const step of steps) {
      for (const tc of step.toolCalls) {
        const tr = step.toolResults.find((r: any) => r.toolCallId === tc.toolCallId);
        allToolCalls.push({ toolName: tc.toolName, args: tc.input, result: tr?.output });
      }
    }

    ctx.emit("complete", `${config.name} finished`);

    return {
      summary: text || `${config.name} completed`,
      data: { toolCalls: allToolCalls },
    };
  }
}
