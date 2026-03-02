import { CodeBlock } from "../../components/CodeBlock";

export function DocsAIProvider() {
  return (
    <>
      <h1>AI provider</h1>
      <p>
        The app uses the{" "}
        <a
          href="https://sdk.vercel.ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          Vercel AI SDK
        </a>{" "}
        and supports multiple AI providers: Anthropic (default), OpenAI, Google
        (Gemini), OpenRouter, Ollama (local), and custom OpenAI-compatible
        endpoints. Configure your provider in Settings → AI Provider.
      </p>

      <h2>Provider configuration</h2>

      <h3>Anthropic (default)</h3>
      <p>
        Supports all agent tools including web search, browser automation,
        WhatsApp, and database access.
      </p>
      <p>Two key formats are accepted:</p>
      <ul>
        <li>
          <strong>Standard API key</strong> — starts with{" "}
          <code>sk-ant-api03-</code>. Get one at{" "}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            console.anthropic.com
          </a>
          .
        </li>
        <li>
          <strong>OAuth setup token</strong> — starts with{" "}
          <code>sk-ant-oat-</code>. Generated from a Claude Max or Pro
          subscription via:
          <CodeBlock>claude setup-token</CodeBlock>
          This uses OAuth authentication and doesn't require a paid API plan.
        </li>
      </ul>
      <p>
        Default model: <code>claude-sonnet-4-20250514</code>. You can change it
        in Settings or switch mid-session in the research chat with:
      </p>
      <CodeBlock>/model claude-opus-4-20250514</CodeBlock>

      <h3>OpenAI</h3>
      <p>
        API key from{" "}
        <a
          href="https://platform.openai.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          platform.openai.com
        </a>
        . Models include <code>gpt-4o</code>, <code>o1</code>, <code>o3</code>,
        and others.
      </p>

      <h3>Google (Gemini)</h3>
      <p>
        API key from{" "}
        <a
          href="https://aistudio.google.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google AI Studio
        </a>
        . Models include <code>gemini-2.5-pro</code> and others.
      </p>

      <h3>OpenRouter</h3>
      <p>
        API key from{" "}
        <a
          href="https://openrouter.ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          openrouter.ai
        </a>
        . Provides access to hundreds of models from multiple providers through a
        single API.
      </p>

      <h3>Ollama (Local)</h3>
      <p>
        No API key needed. Install{" "}
        <a
          href="https://ollama.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ollama
        </a>
        , pull a model (e.g. <code>ollama pull llama3</code>), and point the app
        at <code>http://localhost:11434</code>. Runs fully offline.
      </p>

      <h3>Custom (OpenAI-compatible)</h3>
      <p>
        Any endpoint that implements the OpenAI chat completions API. Provide a
        base URL and an optional API key.
      </p>

      <p>
        You can validate a key before saving using the <strong>Validate</strong>{" "}
        button in the settings form.
      </p>

      <h2>Subagent model</h2>
      <p>
        Browser subagents (spawned by the research agent to navigate complex
        websites) use a separate, lighter model:{" "}
        <code>claude-haiku-4-5-20251001</code>. This keeps costs down for
        high-volume browsing tasks.
      </p>

      <h2>Built-in tools</h2>
      <p>
        Anthropic's server-side <code>web_search</code> and{" "}
        <code>web_fetch</code> tools are only available when using the Anthropic
        provider. These provide richer web research capabilities backed by
        Anthropic's infrastructure. Other providers fall back to custom search
        and scrape tools.
      </p>

      <h2>Embeddings</h2>
      <p>
        Embeddings for semantic search always use OpenAI's{" "}
        <code>text-embedding-3-small</code> model, configured separately from
        the agent provider. This requires an OpenAI API key in addition to
        whichever provider you choose for agents.
      </p>
    </>
  );
}
