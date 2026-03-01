import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type {
  ClientMessage,
  ServerMessage,
  GatewayStateSnapshot,
} from "@wedding-planner/shared";
import type { Router, Db } from "./router.js";
import { getWebDistDir } from "../config/paths.js";

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
  onVapiWebhook?: (payload: unknown) => void;
}

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

const WEB_MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ...MIME_TYPES,
};

function serveStaticFile(filePath: string, res: ServerResponse, cache = false) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = WEB_MIME_TYPES[ext] ?? "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    ...(cache
      ? { "Cache-Control": "public, max-age=31536000, immutable" }
      : {}),
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

export async function createWsServer(options: WsServerOptions) {
  const { port, getState, router, db, imagesDir, onVapiWebhook } = options;
  const clients = new Set<AuthenticatedClient>();
  let eventSeq = 0;

  const webDistDir = getWebDistDir();

  const httpServer = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      // Handle VAPI webhook POST
      if (req.method === "POST" && req.url === "/vapi/webhook") {
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            if (onVapiWebhook) onVapiWebhook(payload);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.writeHead(400);
            res.end("Invalid JSON");
          }
        });
        return;
      }

      if (req.method !== "GET" || !req.url) {
        res.writeHead(404);
        res.end();
        return;
      }

      // Serve vendor images: GET /images/:vendorId/:filename
      const imageMatch = req.url.match(/^\/images\/(\d+)\/([^/]+)$/);
      if (imageMatch && imagesDir) {
        const [, vendorId, filename] = imageMatch;
        const filePath = path.join(imagesDir, vendorId, filename);
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
        return;
      }

      // Serve web UI static files
      if (fs.existsSync(webDistDir)) {
        const urlPath = req.url.split("?")[0];
        const assetPath = path.join(webDistDir, urlPath);
        const resolvedAsset = path.resolve(assetPath);
        const resolvedWebDist = path.resolve(webDistDir);

        if (resolvedAsset.startsWith(resolvedWebDist)) {
          const isAsset =
            path.extname(urlPath) !== "" && urlPath !== "/index.html";
          if (serveStaticFile(assetPath, res, isAsset)) return;
        }

        // SPA fallback: serve index.html for all non-asset routes
        const indexPath = path.join(webDistDir, "index.html");
        if (serveStaticFile(indexPath, res)) return;
      }

      res.writeHead(404);
      res.end();
    },
  );

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

  function broadcast(
    event: Extract<ServerMessage, { type: "event" }>["event"],
  ) {
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
