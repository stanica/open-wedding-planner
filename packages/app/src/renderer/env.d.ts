interface GatewayLogEntry {
  level: "stdout" | "stderr";
  line: string;
  timestamp: number;
}

interface ElectronAPI {
  getGatewayPort: () => Promise<number>;
  onGatewayLog: (callback: (log: GatewayLogEntry) => void) => () => void;
  getGatewayLogBuffer: () => Promise<GatewayLogEntry[]>;
}

interface Window {
  electronAPI: ElectronAPI;
}
