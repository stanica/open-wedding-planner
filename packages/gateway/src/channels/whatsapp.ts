import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import fs from "node:fs";
import path from "node:path";
import type { GatewayEvent } from "@wedding-planner/shared";

export interface WhatsAppConfig {
  dataDir: string;
}

export class WhatsAppChannel {
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private config: WhatsAppConfig;
  private authDir: string;
  private broadcast: (event: GatewayEvent) => void;
  private onMessage:
    | ((msg: { from: string; body: string; messageId: string; selfChat: boolean }) => void)
    | null = null;
  private sentMessageIds = new Set<string>();
  private reconnectDelay = 1000;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private shouldReconnect = true;

  constructor(config: WhatsAppConfig, broadcast: (event: GatewayEvent) => void) {
    this.config = config;
    this.broadcast = broadcast;
    this.authDir = path.join(config.dataDir, "whatsapp-auth");
    fs.mkdirSync(this.authDir, { recursive: true });
  }

  hasCredentials(): boolean {
    return fs.existsSync(path.join(this.authDir, "creds.json"));
  }

  async connect(): Promise<void> {
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.restoreCredsFromBackup();
    await this.doConnect();
  }

  private async doConnect(): Promise<void> {
    console.log("[WhatsApp] doConnect called, attempt:", this.reconnectAttempts);
    // Backup creds before connecting
    this.backupCreds();

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
    });

    this.socket.ev.on("creds.update", async () => {
      this.backupCreds();
      await saveCreds();
    });

    this.socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log("[WhatsApp] connection.update:", { connection, qr: !!qr, statusCode: (lastDisconnect?.error as any)?.output?.statusCode });

      if (qr) {
        this.broadcast({
          name: "channel-status",
          data: { channel: "whatsapp", status: "connecting" },
        });
        // Emit QR as a special event the UI can display
        this.broadcast({
          name: "agent-activity",
          data: {
            sessionKey: "whatsapp-qr",
            action: "qr-code",
            detail: qr,
          },
        });
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        console.log("[WhatsApp] connection closed, statusCode:", statusCode, "loggedOut:", loggedOut);

        this.broadcast({
          name: "channel-status",
          data: { channel: "whatsapp", status: "disconnected" },
        });

        if (loggedOut) {
          // Device was unlinked — clear stale credentials and reconnect to show a fresh QR code
          console.log("[WhatsApp] logged out — clearing credentials for fresh QR");
          this.clearCredentials();
          if (this.shouldReconnect) {
            this.reconnectTimer = setTimeout(() => this.doConnect(), 1000);
          }
        } else if (this.shouldReconnect) {
          this.reconnectAttempts++;
          if (this.reconnectAttempts > this.maxReconnectAttempts) {
            this.broadcast({
              name: "channel-status",
              data: { channel: "whatsapp", status: "failed" },
            });
            this.shouldReconnect = false;
          } else {
            this.reconnectTimer = setTimeout(() => this.doConnect(), this.reconnectDelay);
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 5 * 60_000);
          }
        }
      }

      if (connection === "open") {
        this.reconnectDelay = 1000;
        this.reconnectAttempts = 0;
        this.broadcast({
          name: "channel-status",
          data: { channel: "whatsapp", status: "connected" },
        });
      }
    });

    this.socket.ev.on("messages.upsert", ({ messages }) => {
      for (const msg of messages) {
        // Skip messages we sent ourselves (prevents feedback loops)
        const msgId = msg.key.id ?? "";
        if (this.sentMessageIds.delete(msgId)) continue;

        const body =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          "";
        if (!body) continue;

        const remoteJid = msg.key.remoteJid ?? "";

        console.log("[WhatsApp] message.upsert:", {
          fromMe: msg.key.fromMe,
          remoteJid,
          userJid: this.getUserJid(),
          userLid: this.getUserLid(),
          bodyPreview: body.slice(0, 80),
        });

        if (msg.key.fromMe) {
          // Self-chat: fromMe + remoteJid matches our own JID (phone or LID)
          if (this.isOwnJid(remoteJid)) {
            console.log("[WhatsApp] self-chat detected, dispatching to handler");
            Promise.resolve(
              this.onMessage?.({ from: remoteJid, body, messageId: msg.key.id ?? "", selfChat: true }),
            ).catch((err) => console.error("[WhatsApp] self-chat handler error:", err));
          }
          // Non-self fromMe messages: skip (our own outgoing messages to others)
          continue;
        }

        // Incoming message from someone else
        console.log("[WhatsApp] incoming vendor message from", remoteJid);
        Promise.resolve(
          this.onMessage?.({
            from: remoteJid,
            body,
            messageId: msg.key.id ?? "",
            selfChat: false,
          }),
        ).catch((err) => console.error("[WhatsApp] incoming handler error:", err));
      }
    });
  }

  async send(to: string, text: string): Promise<void> {
    if (!this.socket) throw new Error("WhatsApp not connected");
    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    const sent = await this.socket.sendMessage(jid, { text });
    if (sent?.key?.id) {
      this.sentMessageIds.add(sent.key.id);
    }
  }

  async sendTyping(jid: string): Promise<void> {
    if (!this.socket) return;
    await this.socket.sendPresenceUpdate("composing", jid);
  }

  async stopTyping(jid: string): Promise<void> {
    if (!this.socket) return;
    await this.socket.sendPresenceUpdate("paused", jid);
  }

  onIncoming(
    handler: (msg: { from: string; body: string; messageId: string; selfChat: boolean }) => void,
  ) {
    this.onMessage = handler;
  }

  getUserJid(): string | null {
    if (!this.socket?.user?.id) return null;
    // Normalize: strip device suffix (e.g. "123:45@s.whatsapp.net" → "123@s.whatsapp.net")
    return this.socket.user.id.replace(/:\d+@/, "@");
  }

  /** Get the user's Linked Identity JID (used by WhatsApp multi-device for self-chat) */
  getUserLid(): string | null {
    const lid = (this.socket?.user as any)?.lid;
    if (!lid) return null;
    return lid.replace(/:\d+@/, "@");
  }

  /** Check if a remoteJid belongs to the current user (phone JID or LID) */
  isOwnJid(remoteJid: string): boolean {
    const phoneJid = this.getUserJid();
    const lidJid = this.getUserLid();
    return (!!phoneJid && remoteJid === phoneJid) || (!!lidJid && remoteJid === lidJid);
  }

  isConnected(): boolean {
    return this.socket?.user != null;
  }

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.end(undefined);
    this.socket = null;
  }

  private clearCredentials(): void {
    try {
      const files = fs.readdirSync(this.authDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.authDir, file));
      }
    } catch (err) {
      console.error("[WhatsApp] failed to clear credentials:", err);
    }
  }

  private backupCreds(): void {
    const credsPath = path.join(this.authDir, "creds.json");
    const backupPath = path.join(this.authDir, "creds.json.bak");
    const tmpPath = path.join(this.authDir, "creds.json.bak.tmp");
    try {
      if (fs.existsSync(credsPath)) {
        // Atomic backup: write to temp file, then rename
        fs.copyFileSync(credsPath, tmpPath);
        fs.renameSync(tmpPath, backupPath);
      }
    } catch {
      // Clean up temp file on failure
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
  }

  /**
   * Restore credentials from backup if main creds file is corrupted.
   */
  restoreCredsFromBackup(): boolean {
    const credsPath = path.join(this.authDir, "creds.json");
    const backupPath = path.join(this.authDir, "creds.json.bak");
    try {
      if (!fs.existsSync(credsPath) && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, credsPath);
        return true;
      }
      // Verify creds is valid JSON, restore from backup if not
      if (fs.existsSync(credsPath)) {
        JSON.parse(fs.readFileSync(credsPath, "utf-8"));
      }
    } catch {
      // Main creds corrupted, try restore
      try {
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, credsPath);
          return true;
        }
      } catch {
        // Both corrupted
      }
    }
    return false;
  }
}
