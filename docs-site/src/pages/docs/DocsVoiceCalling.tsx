import { Link } from "react-router-dom";

export function DocsVoiceCalling() {
  return (
    <>
      <h1>Voice Calling (VAPI)</h1>
      <p>
        Open Wedding Planner can make outbound phone calls to vendors using{" "}
        <a
          href="https://vapi.ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          VAPI
        </a>
        . The AI agent calls the vendor on your behalf, and when the call ends
        the app stores a full transcript, summary, structured data, and a
        recording.
      </p>

      <h2>Prerequisites</h2>
      <p>
        You need a{" "}
        <a
          href="https://dashboard.vapi.ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          VAPI account
        </a>{" "}
        with:
      </p>
      <ul>
        <li>
          <strong>API key</strong> — found in your VAPI dashboard under API Keys.
        </li>
        <li>
          <strong>Phone number</strong> — a provisioned phone number ID. Purchase
          or import one in the VAPI dashboard under Phone Numbers.
        </li>
        <li>
          <strong>Assistant</strong> — a VAPI assistant ID. Create one in the
          dashboard or use the default assistant the app provides overrides for.
        </li>
      </ul>

      <h2>Setup</h2>
      <ol>
        <li>
          Go to <strong>Settings → VAPI</strong>.
        </li>
        <li>
          Enter your <strong>API Key</strong>, <strong>Phone Number ID</strong>,
          and <strong>Assistant ID</strong>.
        </li>
        <li>
          Settings are saved automatically and take effect immediately — no
          restart needed.
        </li>
      </ol>
      <p>
        The app automatically starts a Cloudflare tunnel to receive VAPI
        webhooks. When the tunnel connects, it registers the webhook URL with
        your VAPI phone number so call events (status updates, end-of-call
        reports) are delivered in real time.
      </p>

      <h2>Making calls</h2>
      <p>
        The research and outreach agents have access to a{" "}
        <code>makeVapiCall</code> tool. You can ask the agent to call a vendor
        and it will:
      </p>
      <ol>
        <li>Look up the vendor's phone number (or accept one directly).</li>
        <li>
          Initiate an outbound call via VAPI with customisable instructions and
          a first message.
        </li>
        <li>
          Poll for status updates until the call ends (up to 10 minutes).
        </li>
        <li>
          Save the transcript, AI-generated summary, structured data, and
          recording URL to the database.
        </li>
      </ol>
      <p>
        The voice agent introduces itself as calling on behalf of the couple
        names configured in{" "}
        <Link to="/docs/configuration">Wedding Config</Link>.
      </p>

      <h2>Calls view</h2>
      <p>
        All calls are listed in the <strong>Calls</strong> tab in the sidebar.
        The view has three panels:
      </p>
      <ul>
        <li>
          <strong>Call list</strong> (left) — all calls sorted by most recent,
          showing vendor name, status badge, duration, and a summary snippet.
        </li>
        <li>
          <strong>Call details</strong> (centre) — full details for the selected
          call: instructions, summary, structured data, transcript, and an audio
          player for the recording.
        </li>
        <li>
          <strong>AI assistant</strong> (right, on demand) — click "Ask AI" to
          open a resizable chat panel where you can ask questions about the call
          (e.g. "what pricing did they mention?").
        </li>
      </ul>

      <h2>Call statuses</h2>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>queued</code></td>
            <td>Call has been created and is waiting to connect</td>
          </tr>
          <tr>
            <td><code>ringing</code></td>
            <td>The vendor's phone is ringing</td>
          </tr>
          <tr>
            <td><code>in-progress</code></td>
            <td>Call is active (shown with a pulse animation in the UI)</td>
          </tr>
          <tr>
            <td><code>ended</code></td>
            <td>Call completed successfully</td>
          </tr>
          <tr>
            <td><code>failed</code></td>
            <td>Call could not be completed</td>
          </tr>
        </tbody>
      </table>

      <h2>Real-time updates</h2>
      <p>
        VAPI sends webhook events as the call progresses. The gateway processes
        two event types:
      </p>
      <ul>
        <li>
          <strong>status-update</strong> — updates the call status in the
          database and broadcasts it to the UI via WebSocket.
        </li>
        <li>
          <strong>end-of-call-report</strong> — saves the transcript, summary,
          structured data, duration, and recording URL, then broadcasts a
          completion event.
        </li>
      </ul>
      <p>
        The Calls view listens for these events and refreshes automatically — no
        manual polling required on the UI side.
      </p>

      <h2>Deleting calls</h2>
      <p>
        Select a call and click the delete button in the detail header. This
        removes the call record from the local database. Recordings hosted by
        VAPI are not affected.
      </p>
    </>
  );
}
