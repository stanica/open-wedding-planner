import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";
import type { GatewayEvent } from "@wedding-planner/shared";

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  dataDir: string;
}

export interface GmailMessage {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}

export class GmailChannel {
  private oauth2: InstanceType<typeof google.auth.OAuth2>;
  private config: GmailConfig;
  private tokensPath: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private broadcast: (event: GatewayEvent) => void;
  private onMessage: ((msg: { from: string; subject: string; body: string; messageId: string }) => void) | null = null;
  private consecutiveErrors = 0;
  private maxConsecutiveErrors = 10;

  constructor(config: GmailConfig, broadcast: (event: GatewayEvent) => void) {
    this.config = config;
    this.broadcast = broadcast;
    this.tokensPath = path.join(config.dataDir, "gmail-tokens.json");
    this.oauth2 = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri,
    );

    this.loadTokens();
  }

  getAuthUrl(): string {
    return this.oauth2.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    });
  }

  async handleAuthCallback(code: string): Promise<void> {
    const { tokens } = await this.oauth2.getToken(code);
    this.oauth2.setCredentials(tokens);
    this.saveTokens(tokens);
    this.broadcast({ name: "channel-status", data: { channel: "gmail", status: "connected" } });
  }

  isConnected(): boolean {
    return !!this.oauth2.credentials?.access_token;
  }

  async send(msg: GmailMessage): Promise<string> {
    const gmail = google.gmail({ version: "v1", auth: this.oauth2 });

    const headers = [
      `To: ${msg.to}`,
      `Subject: ${msg.subject}`,
      "Content-Type: text/plain; charset=utf-8",
    ];
    if (msg.inReplyTo) {
      headers.push(`In-Reply-To: ${msg.inReplyTo}`);
      headers.push(`References: ${msg.inReplyTo}`);
    }

    const raw = Buffer.from(
      headers.join("\r\n") + "\r\n\r\n" + msg.body,
    ).toString("base64url");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    return res.data.id ?? "";
  }

  onIncoming(handler: (msg: { from: string; subject: string; body: string; messageId: string }) => void) {
    this.onMessage = handler;
  }

  startPolling(intervalMs = 30_000): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.checkInbox(), intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async checkInbox(): Promise<void> {
    if (!this.isConnected() || !this.onMessage) return;

    try {
      const gmail = google.gmail({ version: "v1", auth: this.oauth2 });
      const res = await gmail.users.messages.list({
        userId: "me",
        q: "is:unread",
        maxResults: 5,
      });

      for (const msg of res.data.messages ?? []) {
        if (!msg.id) continue;
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const headers = full.data.payload?.headers ?? [];
        const from = headers.find((h) => h.name === "From")?.value ?? "";
        const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
        const messageId = headers.find((h) => h.name === "Message-ID")?.value ?? msg.id;

        // Extract body
        let body = "";
        const parts = full.data.payload?.parts ?? [];
        const textPart = parts.find((p) => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
        } else if (full.data.payload?.body?.data) {
          body = Buffer.from(full.data.payload.body.data, "base64").toString("utf-8");
        }

        this.onMessage({ from, subject, body, messageId });
        this.consecutiveErrors = 0;

        // Mark as read
        await gmail.users.messages.modify({
          userId: "me",
          id: msg.id,
          requestBody: { removeLabelIds: ["UNREAD"] },
        });
      }
    } catch {
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.broadcast({ name: "channel-status", data: { channel: "gmail", status: "failed" } });
        this.stopPolling();
      } else {
        this.broadcast({ name: "channel-status", data: { channel: "gmail", status: "error" } });
      }
    }
  }

  private loadTokens(): void {
    try {
      if (fs.existsSync(this.tokensPath)) {
        const tokens = JSON.parse(fs.readFileSync(this.tokensPath, "utf-8"));
        this.oauth2.setCredentials(tokens);
      }
    } catch {
      // No stored tokens
    }
  }

  private saveTokens(tokens: unknown): void {
    fs.mkdirSync(path.dirname(this.tokensPath), { recursive: true });
    fs.writeFileSync(this.tokensPath, JSON.stringify(tokens, null, 2));
  }
}
