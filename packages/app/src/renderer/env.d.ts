interface GatewayLogEntry {
  level: "stdout" | "stderr";
  line: string;
  timestamp: number;
}

interface ElectronAPI {
  getGatewayPort: () => Promise<number>;
  onGatewayLog: (callback: (log: GatewayLogEntry) => void) => () => void;
  getGatewayLogBuffer: () => Promise<GatewayLogEntry[]>;
  openExternal: (url: string) => Promise<void>;
  showOpenDialog: (options: { filters?: Array<{ name: string; extensions: string[] }>; properties?: string[] }) => Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface Window {
  electronAPI: ElectronAPI;
}
