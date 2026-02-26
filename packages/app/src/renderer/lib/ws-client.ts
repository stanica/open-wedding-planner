import type {
  ClientMessage,
  ServerMessage,
  GatewayEvent,
} from "@wedding-planner/shared";
import { useGatewayStore } from "../stores/gateway-store";

type EventListener = (event: GatewayEvent) => void;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

class WsClient {
  private ws: WebSocket | null = null;
  private port: number | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private pendingRequests = new Map<string, PendingRequest>();
  private eventListeners = new Set<EventListener>();
  private messageListeners = new Set<(direction: "sent" | "received", msg: unknown) => void>();
  private requestId = 0;
  private shouldReconnect = true;

  async connect() {
    this.port = await window.electronAPI.getGatewayPort();
    this.shouldReconnect = true;
    this.doConnect();
  }

  private doConnect() {
    if (!this.port || !this.shouldReconnect) return;

    this.ws = new WebSocket(`ws://localhost:${this.port}`);

    this.ws.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      for (const listener of this.messageListeners) {
        listener("received", msg);
      }
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      useGatewayStore.getState().setConnected(false);
      if (this.shouldReconnect) {
        setTimeout(() => this.doConnect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay,
        );
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "challenge":
        this.send({ type: "challenge-response", token: msg.token });
        break;

      case "hello-ok":
        this.reconnectDelay = 1000;
        useGatewayStore.getState().setConnected(true);
        useGatewayStore.getState().setState(msg.state);
        break;

      case "pong":
        break;

      case "response": {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          if (msg.ok) {
            pending.resolve(msg.result);
          } else {
            pending.reject(new Error(msg.error));
          }
        }
        break;
      }

      case "event":
        useGatewayStore.getState().setEventSeq(msg.seq);
        for (const listener of this.eventListeners) {
          listener(msg.event);
        }
        break;
    }
  }

  private send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      for (const listener of this.messageListeners) {
        listener("sent", msg);
      }
    }
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `req-${++this.requestId}`;
      this.pendingRequests.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.send({ type: "request", id, method, params });
    });
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onMessage(listener: (direction: "sent" | "received", msg: unknown) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  disconnect() {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WsClient();
