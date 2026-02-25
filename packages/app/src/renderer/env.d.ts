interface ElectronAPI {
  getGatewayPort: () => Promise<number>;
}

interface Window {
  electronAPI: ElectronAPI;
}
