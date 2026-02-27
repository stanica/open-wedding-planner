import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type {
  ClientMessage,
  ServerMessage,
  GatewayStateSnapshot,
} from "@wedding-planner/shared";
import type { Router, Db } from "./router.js";

interface AuthenticatedClient {
  ws: WebSocket;
  authenticated: boolean;
  pendingToken: string | null;
}

export interface WsServerOptions {
  port: number;
  getState: () => GatewayStateSnapshot;
  router?: Router;
  db?: Db;
  imagesDir?: string;
}

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

export async function createWsServer(options: WsServerOptions) {
  const { port, getState, router, db, imagesDir } = options;
  const clients = new Set<AuthenticatedClient>();
  let eventSeq = 0;

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Only serve GET /images/:vendorId/:filename
    if (req.method !== "GET" || !req.url) {
      res.writeHead(404);
      res.end();
      return;
    }

    const match = req.url.match(/^\/images\/(\d+)\/([^/]+)$/);
    if (!match || !imagesDir) {
      res.writeHead(404);
      res.end();
      return;
    }

    const [, vendorId, filename] = match;
    const filePath = path.join(imagesDir, vendorId, filename);

    // Prevent path traversal
    const resolvedPath = path.resolve(filePath);
    const resolvedImagesDir = path.resolve(imagesDir);
    if (!resolvedPath.startsWith(resolvedImagesDir)) {
      res.writeHead(403);
      res.end();
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end();
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    });
    fs.createReadStream(filePath).pipe(res);
  });

  const wss = new WebSocketServer({ server: httpServer });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, resolve);
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
        if (router && db) {
          router
            .handle(db, msg.method, msg.params)
            .then((result) => {
              send(ws, { type: "response", id: msg.id, ok: true, result });
            })
            .catch((err: Error) => {
              send(ws, {
                type: "response",
                id: msg.id,
                ok: false,
                error: err.message,
              });
            });
        } else {
          send(ws, {
            type: "response",
            id: msg.id,
            ok: false,
            error: `Unknown method: ${msg.method}`,
          });
        }
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

  function broadcast(event: Extract<ServerMessage, { type: "event" }>["event"]) {
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
      wss.close(() => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    });
  }

  return { wss, broadcast, close };
}
