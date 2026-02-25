import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type {
  ClientMessage,
  ServerMessage,
  GatewayStateSnapshot,
} from "@wedding-planner/shared";

interface AuthenticatedClient {
  ws: WebSocket;
  authenticated: boolean;
  pendingToken: string | null;
}

export interface WsServerOptions {
  port: number;
  getState: () => GatewayStateSnapshot;
}

export async function createWsServer(options: WsServerOptions) {
  const { port, getState } = options;
  const clients = new Set<AuthenticatedClient>();
  let eventSeq = 0;

  const wss = new WebSocketServer({ port });

  await new Promise<void>((resolve) => {
    wss.on("listening", resolve);
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const token = randomBytes(32).toString("hex");
    const client: AuthenticatedClient = {
      ws,
      authenticated: false,
      pendingToken: token,
    };
    clients.add(client);

    send(ws, { type: "challenge", token });

    ws.on("message", (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === "challenge-response") {
        if (msg.token === client.pendingToken) {
          client.authenticated = true;
          client.pendingToken = null;
          send(ws, { type: "hello-ok", state: getState() });
        } else {
          ws.close(4001, "Invalid challenge response");
        }
        return;
      }

      if (!client.authenticated) {
        ws.close(4002, "Not authenticated");
        return;
      }

      if (msg.type === "ping") {
        send(ws, { type: "pong" });
        return;
      }

      if (msg.type === "request") {
        send(ws, {
          type: "response",
          id: msg.id,
          ok: false,
          error: `Unknown method: ${msg.method}`,
        });
        return;
      }
    });

    ws.on("close", () => {
      clients.delete(client);
    });
  });

  function send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcast(event: ServerMessage extends { type: "event"; event: infer E } ? E : never) {
    eventSeq++;
    const msg: ServerMessage = { type: "event", seq: eventSeq, event };
    for (const client of clients) {
      if (client.authenticated) {
        send(client.ws, msg);
      }
    }
  }

  async function close(): Promise<void> {
    for (const client of clients) {
      client.ws.close(1000, "Server shutting down");
    }
    return new Promise((resolve, reject) => {
      wss.close((err) => (err ? reject(err) : resolve()));
    });
  }

  return { wss, broadcast, close };
}
