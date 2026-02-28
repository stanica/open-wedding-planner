import type { Router } from "../infra/router.js";
import type { TunnelManager } from "../infra/tunnel-manager.js";

export function registerTunnelHandlers(
  router: Router,
  tunnel: TunnelManager,
  port: number,
) {
  router.register("tunnel.status", async () => tunnel.getStatus());

  router.register("tunnel.start", async () => {
    await tunnel.start(port);
    return tunnel.getStatus();
  });

  router.register("tunnel.stop", async () => {
    await tunnel.stop();
    return tunnel.getStatus();
  });
}
