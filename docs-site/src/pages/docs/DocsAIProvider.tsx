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
        with the Anthropic provider. Configure your API key in Settings → AI
        Provider.
      </p>

      <h2>Anthropic API key</h2>
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
          <strong>Setup token</strong> — starts with <code>sk-ant-oat</code>.
          Generated from a Claude Max or Pro subscription via:
          <pre>
            <code>claude setup-token</code>
          </pre>
          This uses OAuth authentication and doesn't require a paid API plan.
        </li>
      </ul>

      <p>
        You can validate a key before saving using the <strong>Validate</strong>{" "}
        button in the settings form.
      </p>

      <h3>Default model</h3>
      <p>
        The default model is <code>claude-sonnet-4-20250514</code>. You can
        change it in Settings or switch mid-session in the research chat with:
      </p>
      <pre>
        <code>/model claude-opus-4-20250514</code>
      </pre>

      <h2>Subagent model</h2>
      <p>
        Browser subagents (spawned by the research agent to navigate complex
        websites) use a separate, lighter model:{" "}
        <code>claude-haiku-4-5-20251001</code>. This keeps costs down for
        high-volume browsing tasks.
      </p>

      <h2>Built-in tools</h2>
      <p>
        In addition to the local tool set, the app enables Anthropic's
        server-side <code>webSearch</code> and <code>webFetch</code> tools for
        richer web research capabilities.
      </p>
    </>
  );
}
