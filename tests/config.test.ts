import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

// NOTE: the repo-root ./config.yaml is a cwd fallback for loadConfig, so
// these tests stub EXCHANGE_PASSWORD — otherwise its file-based password
// reference would (correctly) fail fast in environments without it.
function withDummyExchangePassword<T>(fn: () => T): T {
  const prev = process.env.EXCHANGE_PASSWORD;
  process.env.EXCHANGE_PASSWORD = "test-dummy";
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.EXCHANGE_PASSWORD;
    else process.env.EXCHANGE_PASSWORD = prev;
  }
}

function tempConfig(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  const p = join(dir, "config.yaml");
  writeFileSync(p, yaml);
  return p;
}

const MINIMAL = (passwordLine: string) =>
  `exchange:\n  endpoint: https://x.local\n  powershellUri: https://x.local/PowerShell\nauth:\n  method: basic\n  basic:\n    username: u\n    ${passwordLine}\nserver:\n  transport: stdio\n  port: 3000\n  host: 0.0.0.0\nlogging:\n  level: info\n  file: ''\n`;

describe("loadConfig", () => {
  it("returns defaults when no file", () => {
    const cfg = withDummyExchangePassword(() => loadConfig(tempConfig(MINIMAL("password: test"))));
    expect(cfg.exchange.endpoint).toBeDefined();
    expect(cfg.server.transport).toBe("stdio");
  });

  it("env overrides work", () => {
    process.env.EXCHANGE_ENDPOINT = "https://test.local";
    const cfg = withDummyExchangePassword(() => loadConfig("/nonexistent.yaml"));
    expect(cfg.exchange.endpoint).toBe("https://test.local");
    delete process.env.EXCHANGE_ENDPOINT;
  });

  it("fails fast naming an unset password variable", () => {
    delete process.env.TEST_UPDATER_UNSET_PW_XYZ;
    expect(() => loadConfig(tempConfig(MINIMAL("password: ${TEST_UPDATER_UNSET_PW_XYZ}")))).toThrow(/TEST_UPDATER_UNSET_PW_XYZ/);
  });

  it("expands a set password variable", () => {
    process.env.TEST_UPDATER_SET_PW_XYZ = "s3cret";
    try {
      const cfg = loadConfig(tempConfig(MINIMAL("password: ${TEST_UPDATER_SET_PW_XYZ}")));
      expect(cfg.auth.basic?.password).toBe("s3cret");
    } finally {
      delete process.env.TEST_UPDATER_SET_PW_XYZ;
    }
  });

  it("ignores unset vars outside the active auth path", () => {
    delete process.env.TEST_UPDATER_UNSET_CERT_XYZ;
    const p = tempConfig(
      `exchange:\n  endpoint: https://x.local\n  powershellUri: https://x.local/PowerShell\nauth:\n  method: basic\n  basic:\n    username: u\n    password: plain-not-a-ref\n  certificate:\n    pfxPath: x.pfx\n    passphrase: \${TEST_UPDATER_UNSET_CERT_XYZ}\nserver:\n  transport: stdio\n  port: 3000\n  host: 0.0.0.0\nlogging:\n  level: info\n  file: ''\n`,
    );
    const cfg = withDummyExchangePassword(() => loadConfig(p));
    expect(cfg.auth.method).toBe("basic");
  });
});
