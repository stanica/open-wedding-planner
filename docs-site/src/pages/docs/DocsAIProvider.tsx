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
        under the hood. You can choose between two provider modes in Settings →
        AI Provider.
      </p>

      <h2>Anthropic API key (recommended)</h2>
      <p>
        The default mode. Supports all agent tools including web search, browser
        automation, WhatsApp, and database access.
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

      <h2>Claude Max proxy</h2>
      <p>
        If you have a Claude Max subscription, you can use it instead of an API
        key via the <code>claude-max-api-proxy</code> package. This mode runs in{" "}
        <strong>text-only mode</strong> — agent tools are not available.
      </p>

      <h3>Setup</h3>
      <ol>
        <li>
          Install Claude Code CLI:
          <pre>
            <code>npm install -g @anthropic-ai/claude-code</code>
          </pre>
        </li>
        <li>
          Authenticate:
          <pre>
            <code>claude auth login</code>
          </pre>
        </li>
        <li>
          Select <strong>Claude Max Proxy</strong> in Settings → AI Provider.
          The proxy starts automatically.
        </li>
      </ol>

      <h2>Subagent model</h2>
      <p>
        Browser subagents (spawned by the research agent to navigate complex
        websites) use a separate, lighter model:{" "}
        <code>claude-haiku-4-5-20251001</code>. This keeps costs down for
        high-volume browsing tasks.
      </p>

      <h2>Built-in tools (API key mode only)</h2>
      <p>
        When using a direct Anthropic API key, the app also enables Anthropic's
        server-side <code>webSearch</code> and <code>webFetch</code> tools in
        addition to the local tool set. These are not available in Claude Max
        proxy mode.
      </p>
    </>
  );
}
