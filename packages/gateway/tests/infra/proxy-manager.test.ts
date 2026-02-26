import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProxyManager } from "../../src/infra/proxy-manager.js";

describe("ProxyManager", () => {
  let manager: ProxyManager;

  beforeEach(() => {
    manager = new ProxyManager();
  });

  afterEach(async () => {
    await manager.stop();
  });

  it("is not running initially", () => {
    expect(manager.isRunning()).toBe(false);
  });

  it("reports status correctly", () => {
    const status = manager.getStatus();
    expect(status.running).toBe(false);
    expect(status.url).toBeNull();
    expect(status.error).toBeNull();
  });
});
