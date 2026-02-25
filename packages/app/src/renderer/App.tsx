import { useEffect } from "react";
import { useGatewayStore } from "./stores/gateway-store";
import { wsClient } from "./lib/ws-client";

export function App() {
  const connected = useGatewayStore((s) => s.connected);
  const state = useGatewayStore((s) => s.state);

  useEffect(() => {
    wsClient.connect();
    return () => wsClient.disconnect();
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
      <div className="text-center">
        <h1 className="mb-4 text-3xl font-bold">Wedding Planner</h1>
        <div className="flex items-center justify-center gap-2">
          <div
            className={`h-3 w-3 rounded-full ${connected ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`}
          />
          <span className="text-lg">
            {connected
              ? `Connected to gateway v${state?.version ?? "?"}`
              : "Connecting..."}
          </span>
        </div>
      </div>
    </div>
  );
}
