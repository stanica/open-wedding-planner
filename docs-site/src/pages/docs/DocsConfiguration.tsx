import { Link } from "react-router-dom";

export function DocsConfiguration() {
  return (
    <>
      <h1>Settings overview</h1>
      <p>
        All configuration is managed through the in-app Settings screen and
        persisted in the local SQLite database at{" "}
        <code>~/.wedding-planner/data.db</code>. Nothing is stored in config
        files or environment variables — everything is editable from the UI.
      </p>

      <h2>Wedding Config</h2>
      <p>
        The first thing to fill in. Used by agents to personalise research and
        outreach.
      </p>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Wedding date</td>
            <td>Used in outreach messages and timeline calculations</td>
          </tr>
          <tr>
            <td>Guest count</td>
            <td>Passed to the research agent when looking for venues</td>
          </tr>
          <tr>
            <td>Total budget</td>
            <td>
              Sets the baseline for budget tracking and category allocation
            </td>
          </tr>
          <tr>
            <td>Currency</td>
            <td>Defaults to EUR. Affects all currency displays.</td>
          </tr>
          <tr>
            <td>Couple names</td>
            <td>Used in outreach message drafts</td>
          </tr>
          <tr>
            <td>Location</td>
            <td>Used as a default search location for vendor research</td>
          </tr>
          <tr>
            <td>Language preferences</td>
            <td>Agents will draft messages in these languages</td>
          </tr>
          <tr>
            <td>Dietary / alcohol notes</td>
            <td>Included when researching catering vendors</td>
          </tr>
        </tbody>
      </table>

      <h2>AI Provider</h2>
      <p>
        Choose which AI provider and model powers the research and outreach
        agents. Supported providers: Anthropic (default), OpenAI, Google Gemini,
        OpenRouter, Ollama (local), and any OpenAI-compatible endpoint. See
        the <Link to="/docs/ai-provider">AI provider guide</Link> for full
        details.
      </p>

      <h2>OpenAI API Key</h2>
      <p>
        A separate OpenAI key used exclusively for generating vector embeddings
        (<code>text-embedding-3-small</code>) for semantic search. Without it,
        semantic search across vendors and research notes is disabled. Get a key
        at{" "}
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
        >
          platform.openai.com/api-keys
        </a>
        .
      </p>

      <h2>Search Provider</h2>
      <p>
        Controls which search engine the research agent uses when looking up
        vendors.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>API key required</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>DuckDuckGo</td>
            <td>No</td>
            <td>Default. Scrapes HTML results.</td>
          </tr>
          <tr>
            <td>Brave Search</td>
            <td>Yes</td>
            <td>
              More reliable. Get a key at{" "}
              <a
                href="https://brave.com/search/api/"
                target="_blank"
                rel="noopener noreferrer"
              >
                brave.com/search/api
              </a>
              .
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Heartbeat</h2>
      <p>
        An optional scheduled agent that runs on a configurable interval
        (default: 30 minutes). It always runs a health check — detecting stalled
        tasks and unparsed incoming messages. You can also provide a custom
        research prompt that runs on the same schedule, useful for things like
        "check for new venues in Ischia and add any you haven't seen before."
      </p>
      <table>
        <thead>
          <tr>
            <th>Setting</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Enabled</td>
            <td>Toggle the scheduled agent on or off</td>
          </tr>
          <tr>
            <td>Interval</td>
            <td>How often to run, in minutes</td>
          </tr>
          <tr>
            <td>Prompt</td>
            <td>Optional research instruction to run on each tick</td>
          </tr>
        </tbody>
      </table>

      <h2>Tool Permissions</h2>
      <p>
        Controls which agent tools require explicit user approval before
        running. By default some tools (like sending WhatsApp messages or
        running shell commands) prompt you to allow, always-allow, or deny. You
        can pre-approve tools here to skip the prompt.
      </p>

      <h2>Guardrails</h2>
      <p>
        Safety rules applied to agent outputs. Useful for preventing the agent
        from taking actions outside a defined scope.
      </p>

      <h2>VAPI (Voice Calling)</h2>
      <p>
        Configure credentials for AI-powered outbound phone calls to vendors.
        See the <Link to="/docs/voice-calling">voice calling guide</Link> for
        full details.
      </p>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>API Key</td>
            <td>
              Bearer token from your{" "}
              <a
                href="https://dashboard.vapi.ai"
                target="_blank"
                rel="noopener noreferrer"
              >
                VAPI dashboard
              </a>
            </td>
          </tr>
          <tr>
            <td>Phone Number ID</td>
            <td>ID of the provisioned phone number to call from</td>
          </tr>
          <tr>
            <td>Assistant ID</td>
            <td>
              Default VAPI assistant ID (the app sends overrides for model,
              system prompt, and first message)
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Integrations</h2>
      <p>Connect external services. Currently supported:</p>
      <ul>
        <li>
          <strong>WhatsApp</strong> — scan a QR code to link your personal
          account. See the <Link to="/docs/whatsapp">WhatsApp guide</Link>.
        </li>
        <li>
          <strong>Google Services</strong> — connect Gmail for email outreach
          via the <code>gog</code> CLI (auto-downloaded on first use).
        </li>
      </ul>

      <h2>Internet Tunnel</h2>
      <p>
        Starts a Cloudflare tunnel that exposes the local gateway to the
        internet via a temporary <code>*.trycloudflare.com</code> URL. No
        Cloudflare account required. Useful for accessing the app remotely or
        receiving webhooks. The URL is shown and copyable in the Settings
        screen.
      </p>

      <h2>Data Management</h2>
      <p>
        Export or clear your application data. All data lives in{" "}
        <code>~/.wedding-planner/</code>.
      </p>
    </>
  );
}
