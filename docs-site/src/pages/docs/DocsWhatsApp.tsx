export function DocsWhatsApp() {
  return (
    <>
      <h1>WhatsApp</h1>
      <p>
        Open Wedding Planner connects to WhatsApp using{" "}
        <a
          href="https://github.com/WhiskeySockets/Baileys"
          target="_blank"
          rel="noopener noreferrer"
        >
          Baileys
        </a>
        , an open-source WhatsApp Web library. This means you link your{" "}
        <strong>personal WhatsApp account</strong> — no WhatsApp Business API or
        phone number registration required.
      </p>

      <h2>Connecting your account</h2>
      <ol>
        <li>
          Go to <strong>Settings → Integrations</strong>.
        </li>
        <li>
          A QR code will appear. Scan it with WhatsApp on your phone:{" "}
          <strong>Linked Devices → Link a Device</strong>.
        </li>
        <li>Once connected, the status indicator turns green.</li>
      </ol>
      <p>
        Credentials are saved to <code>~/.wedding-planner/whatsapp-auth/</code>{" "}
        and restored automatically on restart. You won't need to scan the QR
        code again unless you log out or unlink the device from your phone.
      </p>

      <h2>Sending messages</h2>
      <p>There are two ways to send WhatsApp messages to vendors:</p>
      <ul>
        <li>
          <strong>WhatsApp view</strong> — select a vendor conversation and type
          directly in the compose box.
        </li>
        <li>
          <strong>Outreach agent</strong> — ask the AI to draft and send a
          message. The agent will look up the vendor's WhatsApp number, compose
          an appropriate message, and either send it immediately or queue it as
          a draft for your approval.
        </li>
      </ul>

      <h2>Draft approval</h2>
      <p>
        When the outreach agent drafts a message, it appears in the conversation
        thread with an amber approval bar. You can approve (send it) or reject
        (discard it) before anything is sent. To skip approval and let the agent
        send immediately, enable <strong>Auto-send</strong> in Settings →
        Integrations.
      </p>

      <h2>Incoming messages</h2>
      <p>
        Incoming vendor replies appear in the <strong>WhatsApp view</strong> and
        the <strong>Inbox</strong>. The app links them to the correct vendor
        record automatically. You can click any message to open the agent side
        panel and ask the AI to extract pricing, draft a reply, or update the
        vendor record.
      </p>

      <h2>Delivery queue</h2>
      <p>
        Outbound messages are written to a delivery queue at{" "}
        <code>~/.wedding-planner/delivery-queue/</code> before sending. If the
        app restarts mid-send, the queue is recovered and messages are retried
        automatically.
      </p>

      <h2>Disconnecting</h2>
      <p>
        To unlink the account, go to <strong>Settings → Integrations</strong>{" "}
        and click <strong>Disconnect</strong>. You can also unlink from your
        phone under <strong>Linked Devices</strong>. If the device is unlinked
        from the phone side, the app will clear its credentials and show a fresh
        QR code on next connection.
      </p>
    </>
  );
}
