import type { BaseAgent, AgentContext, AgentResult } from "./base-agent.js";

export const translationAgent: BaseAgent = {
  name: "translation",

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { text, from, to } = input as {
      text: string;
      from?: string;
      to: string;
    };

    ctx.emit("translating", `Translating to ${to}...`);

    const { generateText } = await import("ai");
    const { getModel } = await import("./model-provider.js");
    const model = await getModel();

    const { text: translated } = await generateText({
      model,
      system: `You are a professional translator. Translate the following text${from ? ` from ${from}` : ""} to ${to}. Only output the translated text, nothing else.`,
      prompt: text,
      abortSignal: ctx.signal,
    });

    ctx.emit("complete", `Translation complete`);

    return {
      summary: `Translated text to ${to}`,
      data: { translated, from, to },
    };
  },
};

export const mockTranslationAgent: BaseAgent = {
  name: "translation",

  async run(ctx: AgentContext, input: unknown): Promise<AgentResult> {
    const { text, to } = input as { text: string; from?: string; to: string };
    ctx.emit("translating", `Translating to ${to}...`);
    ctx.emit("complete", "Translation complete");

    return {
      summary: `Translated text to ${to}`,
      data: { translated: `[${to}] ${text}`, from: "en", to },
    };
  },
};
