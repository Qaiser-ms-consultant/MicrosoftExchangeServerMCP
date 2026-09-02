import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("returns defaults when no file", () => {
    const cfg = loadConfig("/nonexistent.yaml");
    expect(cfg.exchange.endpoint).toBeDefined();
    expect(cfg.server.transport).toBe("stdio");
  });

  it("env overrides work", () => {
    process.env.EXCHANGE_ENDPOINT = "https://test.local";
    const cfg = loadConfig("/nonexistent.yaml");
    expect(cfg.exchange.endpoint).toBe("https://test.local");
    delete process.env.EXCHANGE_ENDPOINT;
  });
});
