import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { startGateway } from "../src/index.js";
import type { ServerMessage, ClientMessage } from "@wedding-planner/shared";

function createClient(port: number): {
  ws: WebSocket;
  nextMessage: () => Promise<ServerMessage>;
  waitForClose: () => Promise<void>;
} {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const messageQueue: ServerMessage[] = [];
  const waiters: Array<(msg: ServerMessage) => void> = [];

  ws.on("message", (data) => {
    const msg: ServerMessage = JSON.parse(data.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(msg);
    } else {
      messageQueue.push(msg);
    }
  });

  function nextMessage(): Promise<ServerMessage> {
    const queued = messageQueue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timeout waiting for message")), 3000);
      waiters.push((msg) => {
        clearTimeout(t);
        resolve(msg);
      });
    });
  }

  function waitForClose(): Promise<void> {
    return new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) return resolve();
      ws.on("close", () => resolve());
    });
  }

  return { ws, nextMessage, waitForClose };
}

async function handshake(client: ReturnType<typeof createClient>) {
  const challenge = await client.nextMessage();
  if (challenge.type !== "challenge") throw new Error("Expected challenge");
  client.ws.send(JSON.stringify({ type: "challenge-response", token: challenge.token }));
  const hello = await client.nextMessage();
  if (hello.type !== "hello-ok") throw new Error("Expected hello-ok");
  return hello;
}

describe("WebSocket server", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it("completes challenge-response handshake", async () => {
    cleanup = await startGateway({ port: 4591, dbPath: ":memory:" });

    const client = createClient(4591);
    const challenge = await client.nextMessage();
    expect(challenge.type).toBe("challenge");
    if (challenge.type !== "challenge") throw new Error("unreachable");

    client.ws.send(
      JSON.stringify({ type: "challenge-response", token: challenge.token }),
    );

    const hello = await client.nextMessage();
    expect(hello.type).toBe("hello-ok");
    if (hello.type !== "hello-ok") throw new Error("unreachable");
    expect(hello.state).toBeDefined();
    expect(hello.state.version).toBe("0.0.1");
    expect(hello.state.channels.whatsapp).toBe("disconnected");

    client.ws.close();
  });

  it("responds to ping with pong", async () => {
    cleanup = await startGateway({ port: 4592, dbPath: ":memory:" });

    const client = createClient(4592);
    await handshake(client);

    client.ws.send(JSON.stringify({ type: "ping" }));
    const pong = await client.nextMessage();
    expect(pong.type).toBe("pong");

    client.ws.close();
  });

  it("rejects wrong challenge token", async () => {
    cleanup = await startGateway({ port: 4593, dbPath: ":memory:" });

    const client = createClient(4593);
    const challenge = await client.nextMessage();
    expect(challenge.type).toBe("challenge");

    client.ws.send(
      JSON.stringify({ type: "challenge-response", token: "wrong-token" }),
    );

    await client.waitForClose();
    expect(client.ws.readyState).toBe(WebSocket.CLOSED);
  });

  it("returns error for unknown request method", async () => {
    cleanup = await startGateway({ port: 4594, dbPath: ":memory:" });

    const client = createClient(4594);
    await handshake(client);

    client.ws.send(
      JSON.stringify({ type: "request", id: "req-1", method: "foo.bar" }),
    );
    const response = await client.nextMessage();
    expect(response.type).toBe("response");
    if (response.type !== "response") throw new Error("unreachable");
    expect(response.ok).toBe(false);
    if (response.ok) throw new Error("unreachable");
    expect(response.error).toContain("foo.bar");

    client.ws.close();
  });
});
